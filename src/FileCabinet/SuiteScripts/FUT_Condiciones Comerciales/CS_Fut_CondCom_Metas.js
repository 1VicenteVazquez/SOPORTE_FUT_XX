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
        
        let rangosActivos = [];

        for (let i = 0; i < lineCount; i++) {
            // Evaluamos si el checkbox de la línea actual está encendido
            let isActivo = rec.getSublistValue({ sublistId: 'custpage_sublist_metas', fieldId: 'custpage_col_activo', line: i });
            
            // LA MAGIA ESTÁ AQUÍ: Solo validamos si la línea está ACTIVA (true o 'T')
            if (isActivo === true || isActivo === 'T') {
                let textMin = rec.getSublistText({ sublistId: 'custpage_sublist_metas', fieldId: 'custpage_col_rin_min', line: i });
                let textMax = rec.getSublistText({ sublistId: 'custpage_sublist_metas', fieldId: 'custpage_col_rin_max', line: i });
                let segmento = rec.getSublistText({ sublistId: 'custpage_sublist_metas', fieldId: 'custpage_col_nombre', line: i }) || `Línea ${i + 1}`;

                if (textMin && textMax) {
                    let minActual = parseFloat(textMin);
                    let maxActual = parseFloat(textMax);

                    // Comparamos contra los rangos activos que ya revisamos
                    for (let j = 0; j < rangosActivos.length; j++) {
                        let rangoPrevio = rangosActivos[j];
                        
                        if (rangoPrevio.min <= maxActual && rangoPrevio.max >= minActual) {
                            dialog.alert({
                                title: 'Choque de Segmentos Activos',
                                message: `Ambos segmentos están <b>Activos</b> y se cruzan:<br><br><b>${segmento}</b> (Rin ${minActual} a ${maxActual})<br>choca con<br><b>${rangoPrevio.segmento}</b> (Rin ${rangoPrevio.min} a ${rangoPrevio.max}).<br><br>Por favor, desactiva uno de los dos para poder guardar.`
                            });
                            return false; 
                        }
                    }
                    
                    // Si pasó la prueba, lo guardamos en nuestro arreglo de "activos validados"
                    rangosActivos.push({ min: minActual, max: maxActual, segmento: segmento });
                }
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