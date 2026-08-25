/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 *
 * CS_Fut_CondCom_Metas.js
 */
define(['N/url', 'N/currentRecord', 'N/ui/dialog'], (url, currentRecord, dialog) => {

    function pageInit(context) {
        window.cerrarPopup = cerrarPopup;
        window.cancelarEdicionMetas = cancelarEdicionMetas;
    }

    function cerrarPopup() {
        window.close();
    }

    function cancelarEdicionMetas() {
        const rec = currentRecord.get();
        const registroId = rec.getValue('custpage_registro_id');
        
        const suiteletUrl = url.resolveScript({
            scriptId: 'customscript_fut_sl_condcom_metas', 
            deploymentId: 'customdeploy_fut_sl_condcom_metas',
            params: { registroId: registroId, mode: 'view', hideNavBar: 'T' }
        });
        window.onbeforeunload = null;
        window.location.href = suiteletUrl;
    }

    function validateLine(context) {
        const sublistName = context.sublistId;
        
        if (sublistName === 'custpage_sublist_metas') {
            const rec = context.currentRecord;
            
            // Usamos getText porque el campo es tipo SELECT. Así obtenemos el número real ("13", "16")
            const textRinMin = rec.getCurrentSublistText({ sublistId: sublistName, fieldId: 'custpage_col_rin_min' });
            const textRinMax = rec.getCurrentSublistText({ sublistId: sublistName, fieldId: 'custpage_col_rin_max' });
            
            if (textRinMin && textRinMax) {
                if (parseFloat(textRinMin) > parseFloat(textRinMax)) {
                    dialog.alert({
                        title: 'Rango Inválido',
                        message: 'El Rin Mínimo no puede ser mayor al Rin Máximo.'
                    });
                    return false; 
                }
            }
        }
        
        return true; 
    }

    function saveRecord(context) {
        const rec = context.currentRecord;
        const lineCount = rec.getLineCount({ sublistId: 'custpage_sublist_metas' });
        
        let rangos = [];

        for (let i = 0; i < lineCount; i++) {
            // Extraemos el texto visible de la lista (ej. "7", "12") y lo convertimos a número
            let textMin = rec.getSublistText({ sublistId: 'custpage_sublist_metas', fieldId: 'custpage_col_rin_min', line: i });
            let textMax = rec.getSublistText({ sublistId: 'custpage_sublist_metas', fieldId: 'custpage_col_rin_max', line: i });
            let segmento = rec.getSublistText({ sublistId: 'custpage_sublist_metas', fieldId: 'custpage_col_nombre', line: i }) || `Línea ${i + 1}`;

            if (textMin && textMax) {
                let minActual = parseFloat(textMin);
                let maxActual = parseFloat(textMax);

                // Comparamos el rango actual contra todos los rangos que ya revisamos en líneas anteriores
                for (let j = 0; j < rangos.length; j++) {
                    let rangoPrevio = rangos[j];
                    
                    // Lógica de traslape: Si el Mínimo de A es <= al Máximo de B, Y el Máximo de A es >= al Mínimo de B.
                    if (rangoPrevio.min <= maxActual && rangoPrevio.max >= minActual) {
                        dialog.alert({
                            title: 'Error de Traslape',
                            message: `<b>${segmento}</b> tiene el rango de rines <b>${minActual} a ${maxActual}</b>, el cual se cruza con un rango anterior de <b>${rangoPrevio.min} a ${rangoPrevio.max}</b>.<br><br>Por favor ajusta los valores para que no se encimen.`
                        });
                        return false; // Bloquea el guardado
                    }
                }
                
                // Si no chocó con ningún rango, lo guardamos en nuestro arreglo temporal para seguir evaluando
                rangos.push({ min: minActual, max: maxActual });
            }
        }

        return true; 
    }

    return {
        pageInit: pageInit,
        validateLine: validateLine,
        saveRecord: saveRecord,
        cerrarPopup: cerrarPopup,
        cancelarEdicionMetas: cancelarEdicionMetas
    };
});