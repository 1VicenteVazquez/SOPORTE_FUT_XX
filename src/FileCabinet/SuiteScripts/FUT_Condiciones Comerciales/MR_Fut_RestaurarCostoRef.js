/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * 
 * MR_Fut_RestaurarCostoRef.js
 */
define(['N/record', 'N/search', 'N/log', 'N/runtime', 'N/file'], 
(record, search, log, runtime, file) => {
    
    const getInputData = () => {
        // 1. Recibimos el ID del archivo JSON desde los parámetros del script
        const fileId = runtime.getCurrentScript().getParameter({ name: 'custscript_fut_del_file_id' });
        
        if (!fileId) {
            log.error('getInputData', 'No se recibió el parámetro custscript_fut_del_file_id');
            return [];
        }

        try {
            // 2. Cargamos el archivo físico y leemos su contenido
            const fileObj = file.load({ id: fileId });
            const dataStr = fileObj.getContents();
            const itemsARestaurar = JSON.parse(dataStr);
            
            const dataParaMap = [];
            const itemIds = Object.keys(itemsARestaurar);
            
            if (itemIds.length === 0) return [];

            // 3. OPTIMIZACIÓN: Buscamos todos los recordtypes en 1 sola consulta
            const recordTypesMap = {};
            search.create({
                type: search.Type.ITEM,
                filters: [['internalid', 'anyof', itemIds]],
                columns: ['internalid', 'recordtype']
            }).run().each(res => {
                let recType = res.getValue('recordtype');
                recordTypesMap[res.id] = Array.isArray(recType) ? recType[0].value : (typeof recType === 'object' ? recType.value : recType);
                return true;
            });

            // 4. Preparamos la data estructurada para que la procese la fase Map
            for (let itemId in itemsARestaurar) {
                if (recordTypesMap[itemId]) {
                    dataParaMap.push({
                        itemId: itemId,
                        refPrevio: itemsARestaurar[itemId],
                        recordType: recordTypesMap[itemId]
                    });
                }
            }

            return dataParaMap;

        } catch (e) {
            log.error('Error en getInputData (Leyendo Archivo)', e.message);
            return [];
        }
    };

    const map = (context) => {
        const data = JSON.parse(context.value);
        try {
            // Restauramos el Costo REF original en el artículo
            record.submitFields({
                type: data.recordType,
                id: data.itemId,
                values: { 'custitemcustitem_nso_refmxp': data.refPrevio },
                options: { enableSourcing: false, ignoreMandatoryFields: true }
            });
            log.audit(`Restaurado OK [Item ${data.itemId}]`, `Nuevo REF: $${data.refPrevio}`);
        } catch (e) {
            log.error(`Error restaurando Item ${data.itemId}`, e.message);
        }
    };

    const summarize = (summary) => {
        let errores = 0;
        
        // Registrar cualquier error que haya ocurrido en la fase map
        summary.mapSummary.errors.iterator().each((key, error) => {
            log.error(`Error en map (Item: ${key})`, error);
            errores++;
            return true;
        });

        // 5. LIMPIEZA: BORRAR EL ARCHIVO JSON TEMPORAL AL FINALIZAR
        const fileId = runtime.getCurrentScript().getParameter({ name: 'custscript_fut_del_file_id' });
        if (fileId) {
            try {
                file.delete({ id: fileId });
                log.audit('Limpieza Exitosa', `Archivo temporal JSON eliminado del sistema (ID: ${fileId})`);
            } catch (e) {
                log.error(`Error eliminando el archivo temporal ID ${fileId}`, e.message);
            }
        }

        log.audit('Proceso de Restauración Finalizado', `Errores encontrados: ${errores}`);
    };

    return { getInputData, map, summarize };
});