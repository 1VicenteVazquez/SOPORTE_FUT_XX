/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * 
 * MR_Fut_RestaurarCostoRef.js
 */
define(['N/record', 'N/search', 'N/log', 'N/runtime', 'N/file'], 
(record, search, log, runtime, file) => {
    
    const getInputData = () => {
        const fileId = runtime.getCurrentScript().getParameter({ name: 'custscript_fut_del_file_id' });
        
        if (!fileId) {
            log.error('getInputData', 'No se recibió el parámetro custscript_fut_del_file_id');
            return [];
        }

        try {
            // Cargamos el archivo físico y leemos su contenido
            const fileObj = file.load({ id: fileId });
            const dataStr = fileObj.getContents();
            const itemsARestaurar = JSON.parse(dataStr);
            
            const dataParaMap = [];
            
            // Simplemente pasamos el ID del artículo y su valor previo a la fase map
            for (let itemId in itemsARestaurar) {
                dataParaMap.push({
                    itemId: itemId,
                    refPrevio: itemsARestaurar[itemId]
                });
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
            // 1. Buscamos el tipo de registro exacto (1 punto de gobernanza)
            let lookup = search.lookupFields({ 
                type: search.Type.ITEM, 
                id: data.itemId, 
                columns: ['recordtype'] 
            });
            
            let recType = Array.isArray(lookup.recordtype) ? lookup.recordtype[0].value : (typeof lookup.recordtype === 'object' ? lookup.recordtype.value : lookup.recordtype);
            
            // 2. Guardamos el valor (10 puntos de gobernanza)
            if (recType) {
                record.submitFields({
                    type: recType,
                    id: data.itemId,
                    values: { 'custitemcustitem_nso_refmxp': data.refPrevio },
                    options: { enableSourcing: false, ignoreMandatoryFields: true }
                });
                log.audit(`Restaurado OK [Item ${data.itemId}]`, `Nuevo REF: $${data.refPrevio}`);
            } else {
                log.error(`Item ${data.itemId}`, 'No se pudo determinar el recordtype');
            }

        } catch (e) {
            log.error(`Error restaurando Item ${data.itemId}`, e.message);
        }
    };

    const summarize = (summary) => {
        let errores = 0;
        
        summary.mapSummary.errors.iterator().each((key, error) => {
            log.error(`Error en map (Item: ${key})`, error);
            errores++;
            return true;
        });

        // LIMPIEZA: BORRAR EL ARCHIVO JSON TEMPORAL AL FINALIZAR
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