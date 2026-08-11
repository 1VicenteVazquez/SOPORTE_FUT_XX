/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 *
 * CS_CondicionesComerciales_VistaA.js
 */
define(['N/url', 'N/currentRecord'], (url, currentRecord) => {

    function pageInit(context) {
        window.abrirEdicionTipo = abrirEdicionTipo;
        window.abrirEdicionProntoPago = abrirEdicionProntoPago;
        window.abrirEdicionAlcanceMeta = abrirEdicionAlcanceMeta; // NUEVO: Exponemos la función
    }

    function cancelarEdicion() {
        const rec = currentRecord.get();
        const prov = rec.getValue('custpage_proveedor');
        const marca = rec.getValue('custpage_marca');
        
        const suiteletUrl = url.resolveScript({
            scriptId: 'customscript_fut_sl_condcom_vista_a',
            deploymentId: 'customdeploy_fut_sl_condcom_vista_a',
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
            scriptId: 'customscript_fut_sl_condcom_vista_a',
            deploymentId: 'customdeploy_fut_sl_condcom_vista_a',
            params: { proveedor: prov, marca: marca, mode: modo }
        });

        window.onbeforeunload = null; 
        window.location.href = suiteletUrl;
    }

    function abrirEdicionTipo(condicionPadreId, tipoCondicionId, modo) {
        const rec = currentRecord.get();
        const prov = rec.getValue('custpage_proveedor');
        const marca = rec.getValue('custpage_marca');

        const popupUrl = url.resolveScript({
            scriptId: 'customscript_fut_sl_condcom_vista_b',
            deploymentId: 'customdeploy_fut_sl_condcom_vista_b',
            params: { proveedor: prov, marca: marca, padreId: condicionPadreId, tipo: tipoCondicionId, mode: modo, hideNavBar: 'T' }
        });
        window.open(popupUrl, 'PopupRebate', 'width=1100,height=650,resizable=yes,scrollbars=yes');
    }

    function abrirEdicionProntoPago(registroId, modo) {
        const rec = currentRecord.get();
        const prov = rec.getValue('custpage_proveedor');
        const marca = rec.getValue('custpage_marca');

        const popupUrl = url.resolveScript({
            scriptId: 'customscript_fut_sl_condcom_vista_c',
            deploymentId: 'customdeploy_fut_sl_condcom_vista_c',
            params: { proveedor: prov, marca: marca, registroId: registroId, mode: modo, hideNavBar: 'T' }
        });
        window.open(popupUrl, 'PopupProntoPago', 'width=500,height=300,resizable=yes,scrollbars=no');
    }

    function abrirEdicionAlcanceMeta(registroId, modo) {
        const rec = currentRecord.get();
        const prov = rec.getValue('custpage_proveedor');
        const marca = rec.getValue('custpage_marca');

        const popupUrl = url.resolveScript({
            scriptId: 'customscript_fut_sl_condcom_vista_d', 
            deploymentId: 'customdeploy_fut_sl_condcom_vista_d', 
            params: { proveedor: prov, marca: marca, registroId: registroId, mode: modo, hideNavBar: 'T' }
        });
        window.open(popupUrl, 'PopupAlcanceMeta', 'width=500,height=300,resizable=yes,scrollbars=no');
    }

    function fieldChanged(context) {
        if (context.fieldId === 'custpage_proveedor') {
            const proveedor = context.currentRecord.getValue('custpage_proveedor');
            if (proveedor) {
                const suiteletUrl = url.resolveScript({
                    scriptId: 'customscript_fut_sl_condcom_vista_a',
                    deploymentId: 'customdeploy_fut_sl_condcom_vista_a',
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
        buscarCondiciones: buscarCondiciones,
        cancelarEdicion: cancelarEdicion
    };
});