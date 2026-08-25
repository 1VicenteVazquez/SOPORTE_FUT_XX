/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 *
 * CS_Fut_CondCom_Precios.js
 */
define(['N/url', 'N/currentRecord', 'N/ui/dialog'], (url, currentRecord, dialog) => {

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

    // --- NUEVA VALIDACIÓN DE REGLA DE NEGOCIO ---
    function saveRecord(context) {
        const rec = context.currentRecord;
        const sublistName = 'custpage_sublist_precios';
        const lineCount = rec.getLineCount({ sublistId: sublistName });

        let articulosActivos = [];

        for (let i = 0; i < lineCount; i++) {
            let isActivo = rec.getSublistValue({ sublistId: sublistName, fieldId: 'custpage_col_activo', line: i });

            // Solo validamos las líneas que tienen el check de "Activo" encendido
            if (isActivo === true || isActivo === 'T') {
                let itemId = rec.getSublistValue({ sublistId: sublistName, fieldId: 'custpage_col_articulo', line: i });
                let itemText = rec.getSublistText({ sublistId: sublistName, fieldId: 'custpage_col_articulo', line: i });

                if (itemId) {
                    // Verificamos si el ID del artículo ya fue registrado como activo en líneas anteriores
                    if (articulosActivos.includes(itemId)) {
                        dialog.alert({
                            title: 'Restricción de Negocio',
                            message: `El artículo <b>${itemText}</b> está marcado como "Activo" más de una vez.<br><br>Solo puedes tener <b>UN</b> precio especial activo por artículo. Por favor, desactiva o elimina la línea duplicada para poder guardar.`
                        });
                        return false; // Bloquea el guardado
                    }
                    
                    // Si pasa la prueba, lo guardamos en nuestro arreglo de "artículos activos"
                    articulosActivos.push(itemId);
                }
            }
        }
        
        return true; // Permite guardar si todo está bien
    }

    return {
        pageInit: pageInit,
        saveRecord: saveRecord, // Exponemos la nueva función para NetSuite
        cerrarPopup: cerrarPopup,
        cancelarEdicionPrecios: cancelarEdicionPrecios
    };
});