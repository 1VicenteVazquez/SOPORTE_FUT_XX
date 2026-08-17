/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 *
 * CS_CondicionesComerciales_VistaB.js
 */
define(['N/url', 'N/currentRecord'], (url, currentRecord) => {

    const SUBLIST_ID = 'custpage_sublist';

    function pageInit(context) {
        window.cambiarPagina = function(pageNum) {
            const rec = context.currentRecord;
            recargarVentana(rec, pageNum);
        };
        
        window.aplicarEscalasMasivas = aplicarEscalasMasivas;
        window.cerrarPopup = cerrarPopup;
    }

    function cerrarPopup() {
        window.close();
    }

    function fieldChanged(context) {
        const { currentRecord: rec, fieldId } = context;
        if (fieldId === 'custpage_filtro' || fieldId === 'custpage_filtro_rin') {
            recargarVentana(rec, 0);
        }
    }

    function recargarVentana(rec, page) {
        const padreId = rec.getValue('custpage_padre_id');
        const tipoId = rec.getValue('custpage_tipo_id');
        const marcaId = rec.getValue('custpage_marca_id');
        const proveedorId = rec.getValue('custpage_proveedor_id');
        
        const filtro = rec.getValue('custpage_filtro') || '';
        const filtroRin = rec.getValue('custpage_filtro_rin') || '';
        
        const qs = new URLSearchParams(window.location.search);
        const mode = qs.get('mode') || 'view';

        qs.set('padreId', padreId);
        qs.set('tipo', tipoId);
        qs.set('marca', marcaId);
        qs.set('proveedor', proveedorId);
        qs.set('filtro', filtro);
        qs.set('filtroRin', filtroRin);
        qs.set('page', page);
        qs.set('mode', mode);

        window.onbeforeunload = null;
        window.location.href = `${window.location.href.split('?')[0]}?${qs.toString()}`;
    }

    function aplicarEscalasMasivas() {
        const rec = currentRecord.get();
        rec.setValue({ fieldId: 'custpage_accion_masiva', value: 'T' });
        
        try {
            window.onbeforeunload = null;
            if (typeof NLForm !== 'undefined' && NLForm.setSubmitButton) {
                document.forms['main_form'].submit();
            } else {
                document.getElementById('submitter') ? document.getElementById('submitter').click() : document.forms[0].submit();
            }
        } catch (e) {
            document.forms[0].submit();
        }
    }

    function saveRecord(context) {
        const rec = context.currentRecord;
        const lineCount = rec.getLineCount({ sublistId: SUBLIST_ID });
        const cambios = [];

        for (let i = 0; i < lineCount; i++) {
            const id = rec.getSublistValue({ sublistId: SUBLIST_ID, fieldId: 'custpage_col_id', line: i });
            const item = rec.getSublistValue({ sublistId: SUBLIST_ID, fieldId: 'custpage_col_item', line: i });
            const activoVal = rec.getSublistValue({ sublistId: SUBLIST_ID, fieldId: 'custpage_col_activo', line: i });
            const porcentaje = rec.getSublistValue({ sublistId: SUBLIST_ID, fieldId: 'custpage_col_porcentaje', line: i });
            let descripcion = rec.getSublistValue({ sublistId: SUBLIST_ID, fieldId: 'custpage_col_descripcion', line: i });

            if (activoVal === 'T' || activoVal === true || id) {
                cambios.push({
                    id: id || null,
                    item: item,
                    activo: activoVal === 'T' || activoVal === true,
                    porcentaje: porcentaje ? parseFloat(porcentaje) : null,
                    descripcion: (descripcion !== null && descripcion !== undefined) ? String(descripcion) : ''
                });
            }
        }

        rec.setValue({ fieldId: 'custpage_payload', value: JSON.stringify(cambios) });
        return true;
    }

    return {
        pageInit: pageInit,
        fieldChanged: fieldChanged,
        saveRecord: saveRecord,
        aplicarEscalasMasivas: aplicarEscalasMasivas,
        cerrarPopup: cerrarPopup 
    };
});