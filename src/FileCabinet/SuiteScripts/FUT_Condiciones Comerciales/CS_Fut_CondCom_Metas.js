/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 *
 * CS_Fut_CondCom_Metas.js
 */
define(['N/url', 'N/currentRecord'], (url, currentRecord) => {

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
            
            const rinMin = rec.getCurrentSublistValue({ sublistId: sublistName, fieldId: 'custpage_col_rin_min' });
            const rinMax = rec.getCurrentSublistValue({ sublistId: sublistName, fieldId: 'custpage_col_rin_max' });
            
            if (rinMin && rinMax) {
                if (parseInt(rinMin) > parseInt(rinMax)) {
                    alert('Error: El Rin Mínimo no puede ser mayor al Rin Máximo.');
                    return false; 
                }
            }
        }
        
        return true; 
    }

    return {
        pageInit: pageInit,
        validateLine: validateLine,
        cerrarPopup: cerrarPopup,
        cancelarEdicionMetas: cancelarEdicionMetas
    };
});