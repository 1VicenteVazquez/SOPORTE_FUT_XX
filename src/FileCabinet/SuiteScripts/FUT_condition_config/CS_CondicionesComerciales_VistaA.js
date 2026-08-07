/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 *
 * CS_CondicionesComerciales_VistaA.js
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
        window.abrirEdicionTipo = abrirEdicionTipo;
        console.log('CS_VistaA.pageInit -> abrirEdicionTipo expuesta en window.');
    }

    function buscarCondiciones() {
        const rec = currentRecord.get();
        const proveedor = rec.getValue({ fieldId: 'custpage_proveedor' });
        const marca = rec.getValue({ fieldId: 'custpage_marca' });

        if (!proveedor || !marca) {
            alert('Selecciona Proveedor y Marca para buscar.');
            return;
        }

        const suiteletUrl = url.resolveScript({
            scriptId: SL_VISTA_A.scriptId,
            deploymentId: SL_VISTA_A.deploymentId,
            params: { proveedor: proveedor, marca: marca }
        });

        window.location.href = suiteletUrl;
    }

    function abrirEdicionTipo(tipo) {
        const rec = currentRecord.get();
        const proveedor = rec.getValue({ fieldId: 'custpage_proveedor' });
        const marca = rec.getValue({ fieldId: 'custpage_marca' });

        if (!proveedor || !marca) {
            alert('Selecciona Proveedor y Marca antes de ver el detalle.');
            return;
        }

        const popupUrl = url.resolveScript({
            scriptId: SL_VISTA_B.scriptId,
            deploymentId: SL_VISTA_B.deploymentId,
            params: { proveedor: proveedor, marca: marca, tipo: tipo, hideNavBar: 'T' }
        });

        const popupWindow = window.open(
            popupUrl,
            'CondicionesComercialesPopup',
            'width=900,height=600,resizable=yes,scrollbars=yes,toolbar=no,menubar=no,location=no,status=no'
        );

        if (!popupWindow) {
            alert('El navegador bloqueó la ventana emergente. Permite popups para este sitio e inténtalo de nuevo.');
        }
    }

    /**
     * ACTUALIZADO: Al elegir un Proveedor, la página se recarga para
     * que el Suitelet pueda armar el campo de Marca ÚNICAMENTE con
     * las opciones que le pertenecen a ese proveedor.
     */
    function fieldChanged(context) {
        const rec = context.currentRecord;

        if (context.fieldId === 'custpage_proveedor') {
            const proveedor = rec.getValue({ fieldId: 'custpage_proveedor' });
            
            // Resolvemos la URL de este mismo Suitelet
            let params = {};
            if (proveedor) {
                params.proveedor = proveedor;
            }

            const suiteletUrl = url.resolveScript({
                scriptId: SL_VISTA_A.scriptId,
                deploymentId: SL_VISTA_A.deploymentId,
                params: params
            });

            // Evitamos que NetSuite pregunte si queremos salir sin guardar
            window.onbeforeunload = null; 
            window.location.href = suiteletUrl;
        }
    }

    return {
        pageInit: pageInit,
        fieldChanged: fieldChanged,
        buscarCondiciones: buscarCondiciones,
        abrirEdicionTipo: abrirEdicionTipo
    };
});