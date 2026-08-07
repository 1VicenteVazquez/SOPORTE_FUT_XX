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
            const filtro = rec.getValue('custpage_filtro') || '';
            recargarVentana(rec, filtro, pageNum);
        };
    }

    function fieldChanged(context) {
        const { currentRecord: rec, fieldId } = context;
        if (fieldId === 'custpage_filtro') {
            const filtro = rec.getValue('custpage_filtro') || '';
            recargarVentana(rec, filtro, 0); 
        }
    }

    function recargarVentana(rec, filtro, page) {
        const padreId = rec.getValue('custpage_padre_id');
        const tipoId = rec.getValue('custpage_tipo_id');
        const marcaId = rec.getValue('custpage_marca_id');
        const proveedorId = rec.getValue('custpage_proveedor_id');

        const qs = new URLSearchParams(window.location.search);
        qs.set('padreId', padreId);
        qs.set('tipo', tipoId);
        qs.set('marca', marcaId);
        qs.set('proveedor', proveedorId);
        qs.set('filtro', filtro);
        qs.set('page', page);

        window.onbeforeunload = null; 
        window.location.href = `${window.location.href.split('?')[0]}?${qs.toString()}`;
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
            const descripcion = rec.getSublistValue({ sublistId: SUBLIST_ID, fieldId: 'custpage_col_descripcion', line: i });

            // Captura líneas que estén marcadas o que ya tengan ID (para poder actualizarlas)
            if (activoVal === 'T' || activoVal === true || id) {
                cambios.push({
                    id: id || null,
                    item: item,
                    activo: activoVal === 'T' || activoVal === true,
                    porcentaje: parseFloat(porcentaje) || 0,
                    descripcion: descripcion || ''
                });
            }
        }

        rec.setValue({ fieldId: 'custpage_payload', value: JSON.stringify(cambios) });
        return true; 
    }

    return {
        pageInit: pageInit,
        fieldChanged: fieldChanged,
        saveRecord: saveRecord
    };
});