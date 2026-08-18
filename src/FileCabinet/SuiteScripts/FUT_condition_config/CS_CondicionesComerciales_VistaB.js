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
<<<<<<< HEAD
            const filtro = rec.getValue('custpage_filtro') || '';
            recargarVentana(rec, filtro, pageNum);
        };
        
        window.cerrarPopup = function() {
            window.close();
=======
            recargarVentana(rec, pageNum);
>>>>>>> fdfb88114537db9c577dedead9a9284142c75d1a
        };
        
        window.aplicarEscalasMasivas = aplicarEscalasMasivas;
        window.cerrarPopup = cerrarPopup;
    }

<<<<<<< HEAD
    function fieldChanged(context) {
        const { currentRecord: rec, fieldId } = context;
        if (fieldId === 'custpage_filtro') {
            const filtro = rec.getValue('custpage_filtro') || '';
            recargarVentana(rec, filtro, 0); 
        }
    }

    function recargarVentana(rec, filtro, page) {
=======
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
>>>>>>> fdfb88114537db9c577dedead9a9284142c75d1a
        const padreId = rec.getValue('custpage_padre_id');
        const tipoId = rec.getValue('custpage_tipo_id');
        const marcaId = rec.getValue('custpage_marca_id');
        const proveedorId = rec.getValue('custpage_proveedor_id');
        
<<<<<<< HEAD
        // Conservar el modo (Edit/View) actual de la URL
=======
        const filtro = rec.getValue('custpage_filtro') || '';
        const filtroRin = rec.getValue('custpage_filtro_rin') || '';
        
>>>>>>> fdfb88114537db9c577dedead9a9284142c75d1a
        const qs = new URLSearchParams(window.location.search);
        const mode = qs.get('mode') || 'view';

        qs.set('padreId', padreId);
        qs.set('tipo', tipoId);
        qs.set('marca', marcaId);
        qs.set('proveedor', proveedorId);
        qs.set('filtro', filtro);
<<<<<<< HEAD
        qs.set('page', page);
        qs.set('mode', mode);

        window.onbeforeunload = null; 
        window.location.href = `${window.location.href.split('?')[0]}?${qs.toString()}`;
=======
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
>>>>>>> fdfb88114537db9c577dedead9a9284142c75d1a
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
<<<<<<< HEAD
            const descripcion = rec.getSublistValue({ sublistId: SUBLIST_ID, fieldId: 'custpage_col_descripcion', line: i });

            // Captura líneas que estén marcadas o que ya tengan ID (para poder actualizarlas)
=======
            let descripcion = rec.getSublistValue({ sublistId: SUBLIST_ID, fieldId: 'custpage_col_descripcion', line: i });

>>>>>>> fdfb88114537db9c577dedead9a9284142c75d1a
            if (activoVal === 'T' || activoVal === true || id) {
                cambios.push({
                    id: id || null,
                    item: item,
                    activo: activoVal === 'T' || activoVal === true,
<<<<<<< HEAD
                    porcentaje: parseFloat(porcentaje) || 0,
                    descripcion: descripcion || ''
=======
                    porcentaje: porcentaje ? parseFloat(porcentaje) : null,
                    descripcion: (descripcion !== null && descripcion !== undefined) ? String(descripcion) : ''
>>>>>>> fdfb88114537db9c577dedead9a9284142c75d1a
                });
            }
        }

        rec.setValue({ fieldId: 'custpage_payload', value: JSON.stringify(cambios) });
<<<<<<< HEAD
        return true; 
=======
        return true;
>>>>>>> fdfb88114537db9c577dedead9a9284142c75d1a
    }

    return {
        pageInit: pageInit,
        fieldChanged: fieldChanged,
<<<<<<< HEAD
        saveRecord: saveRecord
=======
        saveRecord: saveRecord,
        aplicarEscalasMasivas: aplicarEscalasMasivas,
        cerrarPopup: cerrarPopup 
>>>>>>> fdfb88114537db9c577dedead9a9284142c75d1a
    };
});