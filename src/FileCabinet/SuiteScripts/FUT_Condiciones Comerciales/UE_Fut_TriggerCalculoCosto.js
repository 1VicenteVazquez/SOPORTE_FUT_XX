/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * 
 * UE_Fut_TriggerCalculoCosto.js
 */
define(['N/task', 'N/search', 'N/record', 'N/log', 'N/ui/serverWidget'], 
(task, search, record, log, serverWidget) => {

    const beforeLoad = (context) => {
        // Solo actuamos cuando el usuario está VIENDO el registro
        if (context.type !== context.UserEventType.VIEW) return;

        const rec = context.newRecord;
        const estadoBruto = rec.getValue({ fieldId: 'custbody_fut_status_calculo' });
        const estado = String(estadoBruto || '').trim().toUpperCase();

        log.debug('beforeLoad - Estatus leido', `Estado: "${estado}"`);

        if (!estado) return; // Sin estatus, no mostramos nada

        const form = context.form;
        const htmlBanner = form.addField({
            id: 'custpage_fut_calculo_alerta',
            type: serverWidget.FieldType.INLINEHTML,
            label: 'Alerta Calculo'
        });

        if (estado === 'PROCESANDO') {
            htmlBanner.defaultValue = `
                <div style="background-color: #d9edf7; border-color: #bce8f1; color: #31708f;
                            padding: 15px; margin: 15px 0; border: 1px solid #bce8f1; 
                            border-radius: 4px; font-size: 14px; font-family: sans-serif;">
                    <strong>Cálculo en proceso:</strong> Los costos REF se están calculando en segundo plano. Recibirás un correo cuando el proceso termine.
                </div>
            `;
        } else if (estado === 'EXITO' || estado === 'ÉXITO') {
            htmlBanner.defaultValue = `
                <div style="background-color: #dff0d8; border-color: #d6e9c6; color: #3c763d;
                            padding: 15px; margin: 15px 0; border: 1px solid #d6e9c6; 
                            border-radius: 4px; font-size: 14px; font-family: sans-serif;">
                    <strong>Cálculo completado:</strong> Los costos REF se actualizaron correctamente. Revisa tu correo para el reporte detallado.
                </div>
            `;
            limpiarEstatusDespuesDeMostrar(rec.id);
        } else if (estado === 'ERROR') {
            htmlBanner.defaultValue = `
                <div style="background-color: #f2dede; border-color: #ebccd1; color: #a94442;
                            padding: 15px; margin: 15px 0; border: 1px solid #ebccd1; 
                            border-radius: 4px; font-size: 14px; font-family: sans-serif;">
                    <strong>Cálculo con errores:</strong> Hubo problemas al calcular algunos costos REF. Revisa el reporte enviado a tu correo para más detalles.
                </div>
            `;
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
            log.debug('limpiarEstatusDespuesDeMostrar - OK', `Receipt ${receiptId} | Estatus limpiado tras mostrar banner`);
        } catch (e) {
            log.error('limpiarEstatusDespuesDeMostrar - ERROR', `Receipt ${receiptId} | ${e.message}`);
        }
    };

    const beforeSubmit = (context) => {

        // LÓGICA DE BORRADO (RESTAURAR EL COSTO REF)
        if (context.type === context.UserEventType.DELETE) {
            const oldRecord = context.oldRecord;
            const itemCount = oldRecord.getLineCount({ sublistId: 'item' });
            const itemsARestaurar = {};

            for (let i = 0; i < itemCount; i++) {
                let itemId = oldRecord.getSublistValue({ sublistId: 'item', fieldId: 'item', line: i });
                let refPrevio = oldRecord.getSublistValue({ sublistId: 'item', fieldId: 'custcol_fut_ref_previo', line: i });
                
                if (itemId && refPrevio !== '' && refPrevio !== null && !itemsARestaurar[itemId]) {
                    itemsARestaurar[itemId] = parseFloat(refPrevio);
                }
            }

            for (let itemId in itemsARestaurar) {
                try {
                    let lookup = search.lookupFields({ type: search.Type.ITEM, id: itemId, columns: ['recordtype'] });
                    let recType = Array.isArray(lookup.recordtype) ? lookup.recordtype[0].value : (typeof lookup.recordtype === 'object' ? lookup.recordtype.value : lookup.recordtype);
                    
                    if (recType) {
                        record.submitFields({
                            type: recType,
                            id: itemId,
                            values: { 'custitemcustitem_nso_refmxp': itemsARestaurar[itemId] },
                            options: { enableSourcing: false, ignoreMandatoryFields: true }
                        });
                    }
                } catch (e) {
                    log.error(`Error restaurando REF del artículo ${itemId}`, e.message);
                }
            }
            return; 
        }

        // LÓGICA DE CREACIÓN (PREPARAR DATOS Y TOMAR FOTOGRAFÍAS)
        if (context.type !== context.UserEventType.CREATE) return;

        const newRecord = context.newRecord;
        const itemCount = newRecord.getLineCount({ sublistId: 'item' });
        const subsidiariaTx = newRecord.getValue({ fieldId: 'subsidiary' });

        log.debug('beforeSubmit (Create) - INICIO', `Lineas: ${itemCount} | Subsidiaria: ${subsidiariaTx}`);

        if (itemCount === 0) return;

        const itemIds = [];
        for (let i = 0; i < itemCount; i++) {
            let itemId = newRecord.getSublistValue({ sublistId: 'item', fieldId: 'item', line: i });
            if (itemId && !itemIds.includes(itemId)) {
                itemIds.push(itemId);
            }
        }

        log.debug('beforeSubmit (Create) - Items unicos en el receipt', JSON.stringify(itemIds));

        if (itemIds.length === 0) return;

        const stockSnapshot = {};
        const refSnapshot = {}; 
        try {
            if (itemIds.length > 0) {
                search.create({
                    type: search.Type.ITEM,
                    filters: [['internalid', 'anyof', itemIds]],
                    columns: ['internalid', 'custitemcustitem_nso_refmxp']
                }).run().each(res => {
                    refSnapshot[res.id] = parseFloat(res.getValue('custitemcustitem_nso_refmxp')) || 0;
                    return true;
                });
                log.debug('beforeSubmit (Create) - refSnapshot OK', JSON.stringify(refSnapshot));
            }
        } catch (e) {
            log.error('beforeSubmit (Create) - ERROR en busqueda refSnapshot', `Items: ${JSON.stringify(itemIds)} | Error: ${e.message}`);
        }

        try {
            if (subsidiariaTx) {
                search.create({
                    type: search.Type.ITEM,
                    filters: [
                        ['internalid', 'anyof', itemIds],
                        'AND',
                        ['inventorylocation.subsidiary', 'anyof', subsidiariaTx],
                        'AND',
                        ['inventorylocation.custrecord_fut_ubicacion_virtual', 'is', 'F']
                    ],
                    columns: [
                        search.createColumn({ name: 'internalid', summary: search.Summary.GROUP }),
                        search.createColumn({ name: 'locationquantityonhand', summary: search.Summary.SUM })
                    ]
                }).run().each(res => {
                    let id = res.getValue({ name: 'internalid', summary: search.Summary.GROUP });
                    let qty = parseFloat(res.getValue({ name: 'locationquantityonhand', summary: search.Summary.SUM })) || 0;
                    stockSnapshot[id] = qty;
                    return true;
                });
                log.debug('beforeSubmit (Create) - stockSnapshot OK', JSON.stringify(stockSnapshot));
            }
        } catch (e) {
            log.error('beforeSubmit (Create) - ERROR en busqueda stockSnapshot', `Items: ${JSON.stringify(itemIds)} | Sub: ${subsidiariaTx} | Error: ${e.message}`);
        }

        try {
            for (let i = 0; i < itemCount; i++) {
                let itemId = newRecord.getSublistValue({ sublistId: 'item', fieldId: 'item', line: i });
                
                let stockPrevio = stockSnapshot[itemId] || 0;
                if (stockPrevio < 0) stockPrevio = 0; 
                newRecord.setSublistValue({ sublistId: 'item', fieldId: 'custcol_fut_stock_previo', line: i, value: stockPrevio });

                let refPrevio = refSnapshot[itemId] || 0;
                newRecord.setSublistValue({ sublistId: 'item', fieldId: 'custcol_fut_ref_previo', line: i, value: refPrevio });
            }
            log.debug('beforeSubmit (Create) - Sublistas actualizadas OK', `Total lineas: ${itemCount}`);
        } catch (e) {
            log.error('beforeSubmit (Create) - ERROR seteando sublistas', e.message);
        }

        newRecord.setValue({ fieldId: 'custbody_fut_status_calculo', value: 'PROCESANDO' });
        log.debug('beforeSubmit (Create) - FIN', 'Estatus seteado a PROCESANDO');
    };

    const afterSubmit = (context) => {
        if (context.type !== context.UserEventType.CREATE) return;

        const recordId = context.newRecord.id;

        try {
            const mrTask = task.create({
                taskType: task.TaskType.MAP_REDUCE,
                scriptId: 'customscript_fut_mr_calculo_costoref', 
                deploymentId: 'customdeploy_fut_mr_calculo_costoref', 
                params: {
                    'custscript_fut_receipt_id': recordId 
                }
            });
            mrTask.submit();
            log.debug('afterSubmit', 'Map/Reduce disparado para ID: ' + recordId);
        } catch (e) {
            log.error('Error al lanzar Map/Reduce', e.message);
        }
    };

    return { beforeLoad, beforeSubmit, afterSubmit };
});