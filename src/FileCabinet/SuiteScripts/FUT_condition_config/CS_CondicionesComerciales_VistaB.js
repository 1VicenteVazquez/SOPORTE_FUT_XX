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
        
        window.aplicarMasivo = aplicarMasivo;
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

    function aplicarMasivo() {
        const rec = currentRecord.get();
        
        const minStr = rec.getValue('custpage_mass_rin_min');
        const maxStr = rec.getValue('custpage_mass_rin_max');
        const pct = rec.getValue('custpage_mass_pct');

        if (!minStr || !maxStr || !pct) {
            alert('Por favor, ingresa el Rin Mínimo, Rin Máximo y selecciona un Porcentaje.');
            return;
        }

        const min = parseFloat(minStr);
        const max = parseFloat(maxStr);
        const lineCount = rec.getLineCount({ sublistId: SUBLIST_ID });

        let aplicados = 0;

        for (let i = 0; i < lineCount; i++) {
            const rinStr = rec.getSublistValue({ sublistId: SUBLIST_ID, fieldId: 'custpage_col_rin', line: i });
            
            if (rinStr) {
                const rin = parseFloat(rinStr);
                
                if (!isNaN(rin) && rin >= min && rin <= max) {
                    rec.selectLine({ sublistId: SUBLIST_ID, line: i });
                    rec.setCurrentSublistValue({ sublistId: SUBLIST_ID, fieldId: 'custpage_col_activo', value: true, ignoreFieldChange: true });
                    rec.setCurrentSublistValue({ sublistId: SUBLIST_ID, fieldId: 'custpage_col_porcentaje', value: pct, ignoreFieldChange: true });
                    rec.commitLine({ sublistId: SUBLIST_ID });
                    aplicados++;
                }
            }
        }

        alert(`Proceso terminado. Se actualizaron ${aplicados} artículos en esta página.\n\nRecuerda dar clic en "Guardar Cambios" cuando finalices.`);
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
                    porcentaje: parseFloat(porcentaje) || 0,
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
        aplicarMasivo: aplicarMasivo,
        cerrarPopup: cerrarPopup 
    };
});