/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 *
 * CS_CondicionesComerciales_VistaA.js
 * la chida
 */
define(['N/url', 'N/currentRecord'], (url, currentRecord) => {

    const SL_VISTA_A = {
        scriptId: 'customscript_fut_sl_condcom_vista_a',
        deploymentId: 'customdeploy_fut_sl_condcom_vista_a'
    };

    const SL_VISTA_B = {
        scriptId: 'customscript_fut_sl_condcom_vista_b',
        deploymentId: 'customdeploy_fut_sl_condcom_vista_b'
    };

    function pageInit(context) {
        // Los links "VER" del sublist son HTML crudo (ver
        // SL_CondicionesComerciales_VistaA.js), así que necesitan poder
        // llamar a esta función desde fuera del módulo -> se expone en window.
        window.abrirEdicionTipo = abrirEdicionTipo;
        console.log('CS_VistaA.pageInit -> abrirEdicionTipo expuesta en window.');
    }

    function buscarCondiciones() {
        const rec = currentRecord.get();
        const proveedor = rec.getValue({ fieldId: 'custpage_proveedor' });
        const marca = rec.getValue({ fieldId: 'custpage_marca' });

        console.log('CS_VistaA.buscarCondiciones -> proveedor:', proveedor, '| marca:', marca);

        if (!proveedor || !marca) {
            alert('Selecciona Proveedor y Marca para buscar.');
            return;
        }

        const suiteletUrl = url.resolveScript({
            scriptId: SL_VISTA_A.scriptId,
            deploymentId: SL_VISTA_A.deploymentId,
            params: { proveedor: proveedor, marca: marca }
        });

        console.log('CS_VistaA.buscarCondiciones -> suiteletUrl:', suiteletUrl);

        window.location.href = suiteletUrl;
    }

    /**
     * Llamada desde el link "VER" de cada fila de la tabla (HTML crudo
     * generado en el Suitelet). Abre el popup de Vista B ya filtrado a
     * la Condición específica (tipo: pronto_pago | rebate | crecimiento).
     */
    function abrirEdicionTipo(tipo) {
        const rec = currentRecord.get();
        const proveedor = rec.getValue({ fieldId: 'custpage_proveedor' });
        const marca = rec.getValue({ fieldId: 'custpage_marca' });

        console.log('CS_VistaA.abrirEdicionTipo -> tipo:', tipo, '| proveedor:', proveedor, '| marca:', marca);

        if (!proveedor || !marca) {
            alert('Selecciona Proveedor y Marca antes de ver el detalle.');
            return;
        }

        const popupUrl = url.resolveScript({
            scriptId: SL_VISTA_B.scriptId,
            deploymentId: SL_VISTA_B.deploymentId,
            params: { proveedor: proveedor, marca: marca, tipo: tipo, hideNavBar: 'T' }
        });

        console.log('CS_VistaA.abrirEdicionTipo -> popupUrl:', popupUrl);

        const popupWindow = window.open(
            popupUrl,
            'CondicionesComercialesPopup',
            'width=900,height=600,resizable=yes,scrollbars=yes,toolbar=no,menubar=no,location=no,status=no'
        );

        if (!popupWindow) {
            console.warn('CS_VistaA.abrirEdicionTipo -> window.open devolvió null: probablemente el navegador bloqueó el popup.');
            alert('El navegador bloqueó la ventana emergente. Permite popups para este sitio e inténtalo de nuevo.');
        }
    }

    function fieldChanged(context) {
        // Reservado por si se requiere validación o filtrado adicional
        // al cambiar Proveedor/Marca sin recargar la página.
    }

    return {
        pageInit: pageInit,
        fieldChanged: fieldChanged,
        buscarCondiciones: buscarCondiciones,
        abrirEdicionTipo: abrirEdicionTipo
    };
});