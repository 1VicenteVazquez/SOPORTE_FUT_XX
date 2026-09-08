/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * 
 * UE_Fut_TriggerCalculoCosto.js
 */
define(['N/task', 'N/search', 'N/log', 'N/record'], 
(task, search, log, record) => {

    const beforeSubmit = (context) => {
        if (context.type !== context.UserEventType.CREATE) return;

        const newRecord = context.newRecord;
        const itemCount = newRecord.getLineCount({ sublistId: 'item' });
        const subsidiariaTx = newRecord.getValue({ fieldId: 'subsidiary' });
        
        if (itemCount === 0) return;

        // 1. OBTENER LISTA DE ITEMS ÚNICOS
        const itemIds = [];
        for (let i = 0; i < itemCount; i++) {
            let itemId = newRecord.getSublistValue({ sublistId: 'item', fieldId: 'item', line: i });
            if (itemId && !itemIds.includes(itemId)) {
                itemIds.push(itemId);
            }
        }

        if (itemIds.length === 0) return;

        // 2. OBTENER STOCK PREVIO
        const stockSnapshot = {};
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
        }

        // 3. ACTUALIZAR SUBLISTA CON STOCK PREVIO Y COSTO ANTERIOR
        for (let i = 0; i < itemCount; i++) {
            let itemId = newRecord.getSublistValue({ sublistId: 'item', fieldId: 'item', line: i });
            let stockPrevio = stockSnapshot[itemId] || 0;
            
            if (stockPrevio < 0) stockPrevio = 0; 
            
            newRecord.setSublistValue({
                sublistId: 'item',
                fieldId: 'custcol_fut_stock_previo',
                line: i,
                value: stockPrevio
            });

            // 3a. Buscar el costo actual del artículo para guardarlo como respaldo
            let costoActualRef = 0;
            try {
                let itemFields = search.lookupFields({ type: search.Type.ITEM, id: itemId, columns: ['custitemcustitem_nso_refmxp'] });
                costoActualRef = parseFloat(itemFields.custitemcustitem_nso_refmxp) || 0;
            } catch(e) {}

            // 3b. Guardar el costo anterior en el campo de línea
            newRecord.setSublistValue({
                sublistId: 'item',
                fieldId: 'custcol_refmxp',
                line: i,
                value: costoActualRef
            });
        }

        // 4. MARCAMOS EL REGISTRO
        newRecord.setValue({ fieldId: 'custbody_fut_status_calculo', value: 'PROCESANDO' });
    };

    const beforeDelete = (context) => {
        if (context.type !== context.UserEventType.DELETE) return;

        const oldRecord = context.oldRecord;
        const itemCount = oldRecord.getLineCount({ sublistId: 'item' });

        for (let i = 0; i < itemCount; i++) {
            let itemId = oldRecord.getSublistValue({ sublistId: 'item', fieldId: 'item', line: i });
            let costoAnterior = oldRecord.getSublistValue({ sublistId: 'item', fieldId: 'custcol_refmxp', line: i });

            if (itemId && costoAnterior) {
                try {
                    let itemLookup = search.lookupFields({ type: search.Type.ITEM, id: itemId, columns: ['recordtype'] });
                    let tipoArticulo = Array.isArray(itemLookup.recordtype) ? itemLookup.recordtype[0].value : itemLookup.recordtype;

                    record.submitFields({
                        type: tipoArticulo,
                        id: itemId,
                        values: { 'custitemcustitem_nso_refmxp': parseFloat(costoAnterior) },
                        options: { enableSourcing: false, ignoreMandatoryFields: true }
                    });
                    log.audit('Costo REF Restaurado', `Item: ${itemId} | Costo devuelto a: ${costoAnterior}`);
                } catch (e) {
                    log.error('Error restaurando Costo REF', e.message);
                }
            }
        }
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
        } catch (e) {
            log.error('Error al lanzar Map/Reduce', e.message);
        }
    };

    // 5. RETORNAMOS LAS FUNCIONES
    return { beforeSubmit, beforeDelete, afterSubmit };
});