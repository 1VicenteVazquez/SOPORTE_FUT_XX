/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 *
 * CS_Fut_CondCom_Precios.js
 */
define(['N/url', 'N/currentRecord'], (url, currentRecord) => {

    function pageInit(context) {
        window.cerrarPopup = cerrarPopup;
        window.cancelarEdicionPrecios = cancelarEdicionPrecios;
    }

    function cerrarPopup() {
        window.close();
    }

    function cancelarEdicionPrecios() {
        const rec = currentRecord.get();
        const registroId = rec.getValue('custpage_registro_id');
        
        const suiteletUrl = url.resolveScript({
            scriptId: 'customscript_fut_sl_condcom_precios', 
            deploymentId: 'customdeploy_fut_sl_condcom_precios',
            params: { registroId: registroId, mode: 'view', hideNavBar: 'T' }
        });
        window.onbeforeunload = null;
        window.location.href = suiteletUrl;
    }

    return {
        pageInit: pageInit,
        cerrarPopup: cerrarPopup,
        cancelarEdicionPrecios: cancelarEdicionPrecios
    };
});