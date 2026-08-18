/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 *
 * CS_Fut_CondCom_Panel.js
 */
define(['N/url', 'N/currentRecord', 'N/ui/dialog'], (url, currentRecord, dialog) => {
    
    // FUNCIONES PARA ABRIR LOS POPUPS DE METAS Y PRECIOS
    function pageInit(context) {
        window.abrirMatrizMetas = abrirMatrizMetas;
        window.abrirMatrizPrecios = abrirMatrizPrecios; 
    }

    // FUNCION PARA ABRIR EL POPUP DE MATRIZ DE PRECIOS
    function abrirMatrizPrecios(registroId, modo) {
        const popupUrl = url.resolveScript({
            scriptId: 'customscript_fut_sl_condcom_precios',
            deploymentId: 'customdeploy_fut_sl_condcom_precios', 
            params: { registroId: registroId, mode: modo, hideNavBar: 'T' }
        });
        
        window.open(popupUrl, 'PopupMatrizPrecios', 'width=800,height=500,resizable=yes,scrollbars=yes');
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
            dialog.alert({
                title: 'Información Requerida',
                message: 'Por favor, selecciona un <b>Proveedor</b> y una <b>Marca</b> antes de realizar la búsqueda.'
            });
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

        const popupUrl = url.resolveScript({
            scriptId: 'customscript_fut_sl_condcom_metas', 
            deploymentId: 'customdeploy_fut_sl_condcom_metas', 
            params: { proveedor: prov, marca: marca, registroId: registroId, mode: modo, hideNavBar: 'T' }
        });
        
        window.open(popupUrl, 'PopupMatrizMetas', 'width=900,height=500,resizable=yes,scrollbars=yes');
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

    // --- REGLA DE NEGOCIO: VALIDACIÓN CON UI DIALOG ---
    function saveRecord(context) {
        const rec = context.currentRecord;
        const sublistId = 'custpage_sublist';
        
        const lineCount = rec.getLineCount({ sublistId: sublistId });
        
        if (lineCount > 0) {
            let condicionesActivas = 0;

            for (let i = 0; i < lineCount; i++) {
                const isActivo = rec.getSublistValue({ sublistId: sublistId, fieldId: 'custpage_col_activo', line: i });
                if (isActivo === true || isActivo === 'T') {
                    condicionesActivas++;
                }
            }

            if (condicionesActivas > 1) {
                dialog.alert({
                    title: 'Restricción de Negocio',
                    message: 'Solo puedes tener <b>UNA</b> condición "Activa" por Proveedor y Marca al mismo tiempo.<br><br>Por favor, desmarca las condiciones históricas antes de guardar.'
                });
                return false; 
            }
        }
        
        return true; 
    }

    return {
        pageInit: pageInit,
        fieldChanged: fieldChanged,
        cancelarEdicion: cancelarEdicion,
        buscarCondiciones: buscarCondiciones,
        saveRecord: saveRecord,
        abrirMatrizPrecios: abrirMatrizPrecios // CORRECCIÓN APLICADA AQUÍ
    };
});