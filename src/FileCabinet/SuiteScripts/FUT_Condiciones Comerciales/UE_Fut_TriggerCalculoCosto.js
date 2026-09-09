/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * 
 * UE_Fut_TriggerCalculoCosto.js
 */
define(['N/task', 'N/search', 'N/record', 'N/log', 'N/ui/serverWidget', 'N/file', 'N/runtime'], 
(task, search, record, log, serverWidget, file, runtime) => {

    const beforeLoad = (context) => {
        if (context.type !== context.UserEventType.VIEW) return;
        const rec = context.newRecord;
        const estadoBruto = rec.getValue({ fieldId: 'custbody_fut_status_calculo' });
        const estado = String(estadoBruto || '').trim().toUpperCase();
        if (!estado) return; 

        const form = context.form;
        const htmlBanner = form.addField({
            id: 'custpage_fut_calculo_alerta',
            type: serverWidget.FieldType.INLINEHTML,
            label: 'Alerta Calculo'
        });

        if (estado === 'PROCESANDO') {
            htmlBanner.defaultValue = `<div style="background-color: #d9edf7; padding: 15px; margin: 15px 0; border: 1px solid #bce8f1; border-radius: 4px; color: #31708f;"><strong>Cálculo en proceso:</strong> Los costos REF se están calculando...</div>`;
        } else if (estado === 'EXITO' || estado === 'ÉXITO') {
            htmlBanner.defaultValue = `<div style="background-color: #dff0d8; padding: 15px; margin: 15px 0; border: 1px solid #d6e9c6; border-radius: 4px; color: #3c763d;"><strong>Cálculo completado.</strong></div>`;
            limpiarEstatusDespuesDeMostrar(rec.id);
        } else if (estado === 'ERROR') {
            htmlBanner.defaultValue = `<div style="background-color: #f2dede; padding: 15px; margin: 15px 0; border: 1px solid #ebccd1; border-radius: 4px; color: #a94442;"><strong>Cálculo con errores.</strong></div>`;
            limpiarEstatusDespuesDeMostrar(rec.id);
        }
    };

    const limpiarEstatusDespuesDeMostrar = (receiptId) => {
        try {
            record.submitFields({
                type: record.Type.ITEM_RECEIPT,
                id: receiptId,
                values: { custbody_fut_status_calculo: '' },
                options: { enableSourcing: false, ignoreMandatoryFields: true }
            });
        } catch (e) { log.error('limpiarEstatusDespuesDeMostrar - ERROR', e.message); }
    };

    const beforeSubmit = (context) => {
        if (context.type !== context.UserEventType.CREATE) return;
        const newRecord = context.newRecord;
        const itemCount = newRecord.getLineCount({ sublistId: 'item' });
        const subsidiariaTx = newRecord.getValue({ fieldId: 'subsidiary' });
        if (itemCount === 0) return;

        const itemIds = [];
        for (let i = 0; i < itemCount; i++) {
            let itemId = newRecord.getSublistValue({ sublistId: 'item', fieldId: 'item', line: i });
            if (itemId && !itemIds.includes(itemId)) itemIds.push(itemId);
        }
        if (itemIds.length === 0) return;

        const stockSnapshot = {};
        const refSnapshot = {}; 
        try {
            search.create({ type: search.Type.ITEM, filters: [['internalid', 'anyof', itemIds]], columns: ['internalid', 'custitemcustitem_nso_refmxp'] })
                .run().each(res => { refSnapshot[res.id] = parseFloat(res.getValue('custitemcustitem_nso_refmxp')) || 0; return true; });
        } catch (e) { log.error('ERROR refSnapshot', e.message); }

        try {
            if (subsidiariaTx) {
                search.create({
                    type: search.Type.ITEM,
                    filters: [['internalid', 'anyof', itemIds], 'AND', ['inventorylocation.subsidiary', 'anyof', subsidiariaTx], 'AND', ['inventorylocation.custrecord_fut_ubicacion_virtual', 'is', 'F']],
                    columns: [search.createColumn({ name: 'internalid', summary: search.Summary.GROUP }), search.createColumn({ name: 'locationquantityonhand', summary: search.Summary.SUM })]
                }).run().each(res => { stockSnapshot[res.getValue({ name: 'internalid', summary: search.Summary.GROUP })] = parseFloat(res.getValue({ name: 'locationquantityonhand', summary: search.Summary.SUM })) || 0; return true; });
            }
        } catch (e) { log.error('ERROR stockSnapshot', e.message); }

        try {
            for (let i = 0; i < itemCount; i++) {
                let itemId = newRecord.getSublistValue({ sublistId: 'item', fieldId: 'item', line: i });
                let stockPrevio = stockSnapshot[itemId] || 0;
                newRecord.setSublistValue({ sublistId: 'item', fieldId: 'custcol_fut_stock_previo', line: i, value: (stockPrevio < 0 ? 0 : stockPrevio) });
                
                // AQUÍ USAMOS EL ID DE CAMPO CORRECTO PARA GUARDAR LA FOTOGRAFÍA
                newRecord.setSublistValue({ sublistId: 'item', fieldId: 'custcol_refmxp', line: i, value: (refSnapshot[itemId] || 0) });
            }
        } catch (e) { log.error('ERROR sublistas', e.message); }

        newRecord.setValue({ fieldId: 'custbody_fut_status_calculo', value: 'PROCESANDO' });
    };

    const afterSubmit = (context) => {
        // 1. LÓGICA DE ELIMINACIÓN (Guardar JSON en File Cabinet y disparar MR)
        if (context.type === context.UserEventType.DELETE) {
            const oldRecord = context.oldRecord;
            const itemCount = oldRecord.getLineCount({ sublistId: 'item' });
            const itemsARestaurar = {};

            const carpetaId = runtime.getCurrentScript().getParameter({ name: 'custscript_fut_json_folder_id' });

            if (!carpetaId) {
                log.error('Error de Configuración', 'Falta configurar el parámetro custscript_fut_json_folder_id en el deployment del User Event.');
                return;
            }

            for (let i = 0; i < itemCount; i++) {
                let itemId = oldRecord.getSublistValue({ sublistId: 'item', fieldId: 'item', line: i });
                
                // AQUÍ USAMOS EL ID DE CAMPO CORRECTO PARA LEER LA FOTOGRAFÍA
                let refPrevioRaw = oldRecord.getSublistValue({ sublistId: 'item', fieldId: 'custcol_refmxp', line: i });
                
                // PROTECCIÓN CONTRA NULOS
                let refPrevio = parseFloat(refPrevioRaw);
                
                if (itemId && !isNaN(refPrevio) && !itemsARestaurar[itemId]) {
                    itemsARestaurar[itemId] = refPrevio;
                }
            }

            if (Object.keys(itemsARestaurar).length > 0) {
                try {
                    const fileObj = file.create({
                        name: `restaurar_ref_receipt_${oldRecord.id}_${new Date().getTime()}.json`,
                        fileType: file.Type.JSON,
                        contents: JSON.stringify(itemsARestaurar),
                        folder: carpetaId
                    });
                    
                    const fileId = fileObj.save();

                    task.create({
                        taskType: task.TaskType.MAP_REDUCE,
                        scriptId: 'customscript_fut_mr_restaurar_costoref', 
                        deploymentId: 'customdeploy_fut_mr_restaurar_costoref', 
                        params: { 'custscript_fut_del_file_id': fileId }
                    }).submit();
                    log.audit('afterSubmit (DELETE)', `JSON guardado. File ID: ${fileId}. MR disparado.`);
                } catch (e) {
                    log.error('Error creando JSON o disparando MR', e.message);
                }
            } else {
                log.audit('afterSubmit (DELETE)', 'No hay costos previos válidos para restaurar (líneas vacías o NaN).');
            }
        }

        // 2. LÓGICA DE CREACIÓN (Dispara MR de Cálculo)
        if (context.type === context.UserEventType.CREATE) {
            try {
                task.create({
                    taskType: task.TaskType.MAP_REDUCE,
                    scriptId: 'customscript_fut_mr_calculo_costoref', 
                    deploymentId: 'customdeploy_fut_mr_calculo_costoref', 
                    params: { 'custscript_fut_receipt_id': context.newRecord.id }
                }).submit();
            } catch (e) { log.error('Error al lanzar Map/Reduce Cálculo', e.message); }
        }
    };

    return { beforeLoad, beforeSubmit, afterSubmit };
});