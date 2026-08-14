/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 *
 * CS_Fut_CondCom_Panel.js
 */
define(['N/url', 'N/currentRecord'], (url, currentRecord) => {

    function pageInit(context) {
        // Exponemos la función al entorno global para el enlace HTML de la sublista
        window.abrirMatrizMetas = abrirMatrizMetas;
    }

    function cancelarEdicion() {
        const rec = currentRecord.get();
        const prov = rec.getValue('custpage_proveedor');
        const marca = rec.getValue('custpage_marca');
        
        const suiteletUrl = url.resolveScript({
            scriptId: 'customscript_fut_sl_condcom_panel', 
            deploymentId: 'customdeploy_fut_sl_condcom_panel',
            params: { proveedor: prov, marca: marca, mode: 'view' }
        });
        window.onbeforeunload = null;
        window.location.href = suiteletUrl;
    }

    function buscarCondiciones() {
        const rec = currentRecord.get();
        const prov = rec.getValue('custpage_proveedor');
        const marca = rec.getValue('custpage_marca');
        const modo = rec.getValue('custpage_mode') || 'view';

        if (!prov || !marca) {
            alert('Selecciona Proveedor y Marca para buscar.');
            return;
        }

        const suiteletUrl = url.resolveScript({
            scriptId: 'customscript_fut_sl_condcom_panel',
            deploymentId: 'customdeploy_fut_sl_condcom_panel',
            params: { proveedor: prov, marca: marca, mode: modo }
        });

        window.onbeforeunload = null; 
        window.location.href = suiteletUrl;
    }

    function abrirMatrizMetas(registroId, modo) {
        const rec = currentRecord.get();
        const prov = rec.getValue('custpage_proveedor');
        const marca = rec.getValue('custpage_marca');

        // Abre la ventana emergente (Popup) del Suitelet de Metas
        const popupUrl = url.resolveScript({
            scriptId: 'customscript_fut_sl_condcom_metas', 
            deploymentId: 'customdeploy_fut_sl_condcom_metas', 
            params: { proveedor: prov, marca: marca, registroId: registroId, mode: modo, hideNavBar: 'T' }
        });
        
        window.open(popupUrl, 'PopupMatrizMetas', 'width=800,height=500,resizable=yes,scrollbars=yes');
    }

    function fieldChanged(context) {
        if (context.fieldId === 'custpage_proveedor') {
            const proveedor = context.currentRecord.getValue('custpage_proveedor');
            if (proveedor) {
                const suiteletUrl = url.resolveScript({
                    scriptId: 'customscript_fut_sl_condcom_panel',
                    deploymentId: 'customdeploy_fut_sl_condcom_panel',
                    params: { proveedor: proveedor, mode: 'view' }
                });
                window.onbeforeunload = null; 
                window.location.href = suiteletUrl;
            }
        }
    }

    return {
        pageInit: pageInit,
        fieldChanged: fieldChanged,
        cancelarEdicion: cancelarEdicion,
        buscarCondiciones: buscarCondiciones
    };
});