/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * 
 * UE_Fut_TriggerCalculoCosto.js
 */
define(['N/task', 'N/search', 'N/log'], (task, search, log) => {
    
    const beforeSubmit = (context) => {
        if (context.type !== context.UserEventType.CREATE) return;

        const newRecord = context.newRecord;
        const itemCount = newRecord.getLineCount({ sublistId: 'item' });
        const subsidiariaTx = newRecord.getValue({ fieldId: 'subsidiary' });
        
        if (itemCount === 0) return;

        // 1. RECOLECTAR IDs ÚNICOS (Para la Búsqueda Masiva)
        const itemIds = [];
        for (let i = 0; i < itemCount; i++) {
            let itemId = newRecord.getSublistValue({ sublistId: 'item', fieldId: 'item', line: i });
            if (itemId && !itemIds.includes(itemId)) {
                itemIds.push(itemId);
            }
        }

        if (itemIds.length === 0) return;

        // 2. OBTENER STOCK PREVIO DE CADA ITEM EN LA SUBSIDIARIA (Excluyendo Ubicaciones Virtuales)
        // Solo cuesta 10 puntos de gobernanza
        const stockSnapshot = {};
        if (subsidiariaTx) {
            search.create({
                type: search.Type.ITEM,
                filters: [
                    ['internalid', 'anyof', itemIds],
                    'AND',
                    ['inventorylocation.subsidiary', 'anyof', subsidiariaTx],
                    'AND',
                    ['inventorylocation.custrecord_fut_ubicacion_virtual', 'is', 'F'] // Excluye ubicaciones virtuales
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

        // 3. ESTAMPAR LA FOTOGRAFÍA EN CADA LÍNEA
        for (let i = 0; i < itemCount; i++) {
            let itemId = newRecord.getSublistValue({ sublistId: 'item', fieldId: 'item', line: i });
            let stockPrevio = stockSnapshot[itemId] || 0;
            
            // Si el stock previo es negativo, lo ajustamos a cero para evitar inconsistencias
            if (stockPrevio < 0) stockPrevio = 0; 
            
            newRecord.setSublistValue({
                sublistId: 'item',
                fieldId: 'custcol_fut_stock_previo',
                line: i,
                value: stockPrevio
            });
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
            let taskId = mrTask.submit();
            log.audit('MR Iniciado', `Task: ${taskId} | Recepción: ${recordId}`);
        } catch (e) {
            log.error('Error al lanzar Map/Reduce', e.message);
        }
    };

    return { beforeSubmit, afterSubmit };
});