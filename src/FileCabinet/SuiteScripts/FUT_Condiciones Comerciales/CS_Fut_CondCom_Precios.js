/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 *
 * CS_Fut_CondCom_Precios.js
 */
define(['N/url', 'N/currentRecord', 'N/search', 'N/ui/dialog'], (url, currentRecord, search, dialog) => {

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

    // --- NUEVA VALIDACIÓN EN TIEMPO REAL ---
    function validateField(context) {
        const sublistName = context.sublistId;
        const fieldName = context.fieldId;

        if (sublistName === 'custpage_sublist_precios' && fieldName === 'custpage_col_articulo') {
            const rec = context.currentRecord;
            const itemId = rec.getCurrentSublistValue({ sublistId: sublistName, fieldId: fieldName });
            const marcaPadre = rec.getValue('custpage_marca_padre'); // Leemos la marca que nos mandó el Suitelet

            if (itemId && marcaPadre) {
                try {
                    // Vamos a revisar la marca del artículo que acaban de seleccionar
                    const itemLookup = search.lookupFields({
                        type: search.Type.ITEM,
                        id: itemId,
                        columns: ['custitem_nso_marca']
                    });

                    let marcaArticulo = '';
                    if (itemLookup.custitem_nso_marca) {
                        let m = itemLookup.custitem_nso_marca;
                        marcaArticulo = Array.isArray(m) ? m[0].value : m.value;
                    }

                    // Si la marca del artículo no es igual a la marca de la condición...
                    if (marcaArticulo !== marcaPadre) {
                        dialog.alert({
                            title: 'Artículo Inválido',
                            message: 'Este artículo <b>no pertenece a la Marca</b> asignada a esta Condición Comercial.<br><br>Por favor elige un artículo válido.'
                        });
                        return false; // Bloquea la selección y regresa la celda a blanco
                    }
                } catch (e) {
                    console.error('Error validando artículo', e);
                }
            }
        }
        return true; 
    }

    return {
        pageInit: pageInit,
        cerrarPopup: cerrarPopup,
        cancelarEdicionPrecios: cancelarEdicionPrecios,
        validateField: validateField // Exportamos la nueva función
    };
});