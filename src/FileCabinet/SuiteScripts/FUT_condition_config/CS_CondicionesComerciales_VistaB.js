/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 *
 * CS_CondicionesComerciales_VistaB.js
 *
 * - Valida que el % (Pronto Pago / Rebate / Crecimiento, según el "tipo"
 *   que se esté editando) esté entre 0 y 20 (decimales permitidos).
 * - Los Artículos se agregan directo en la tabla (columna Artículo editable
 *   + botón nativo "Add" de NetSuite) - ya no hay selector externo.
 * - validateLine evita agregar el mismo Artículo dos veces.
 * - NUEVO: validateLine también rechaza Artículos que NO correspondan al
 *   Proveedor seleccionado (según su historial de Purchase Order/Bill,
 *   calculado en el Suitelet y recibido aquí en custpage_articulos_permitidos).
 *   Esto evita el problema original: agregar un Artículo de una Marca
 *   distinta a la que se estaba filtrando en Vista A/B.
 * - Al guardar, detecta qué líneas cambiaron respecto al estado original
 *   y arma el JSON que el Suitelet (Vista B) recibirá por POST.
 */
define(['N/currentRecord'], (currentRecord) => {

    const SUBLIST_ID = 'custpage_sublist';
    const CAMPOS_PERCENT = ['custpage_col_prontopago', 'custpage_col_rebate', 'custpage_col_crecimiento'];

    const PORCENTAJE_MIN = 0;
    const PORCENTAJE_MAX = 20;

    let lineasOriginales = {};

    // NUEVO: array de internal IDs (string) de Artículos permitidos para
    // el Proveedor de este popup. Se llena en pageInit leyendo el campo
    // oculto custpage_articulos_permitidos que manda el Suitelet.
    let articulosPermitidos = [];

    function pageInit(context) {
        const rec = context.currentRecord;
        const lineCount = rec.getLineCount({ sublistId: SUBLIST_ID });

        console.log('CS_VistaB.pageInit -> líneas cargadas:', lineCount);

        lineasOriginales = {};
        for (let i = 0; i < lineCount; i++) {
            lineasOriginales[i] = snapshotLinea(rec, i);
        }

        console.log('CS_VistaB.pageInit -> snapshot original:', lineasOriginales);

        // ---- NUEVO: cargar lista de Artículos permitidos ----
        try {
            const raw = rec.getValue({ fieldId: 'custpage_articulos_permitidos' });
            articulosPermitidos = raw ? JSON.parse(raw) : [];
        } catch (e) {
            console.error('CS_VistaB.pageInit -> error parseando articulosPermitidos:', e);
            articulosPermitidos = [];
        }

        console.log('CS_VistaB.pageInit -> artículos permitidos para este Proveedor:', articulosPermitidos.length, articulosPermitidos);
        // -------------------------------------------------------
    }

    function snapshotLinea(rec, line) {
        return {
            id: rec.getSublistValue({ sublistId: SUBLIST_ID, fieldId: 'custpage_col_id', line }),
            item: rec.getSublistValue({ sublistId: SUBLIST_ID, fieldId: 'custpage_col_item', line }),
            activo: rec.getSublistValue({ sublistId: SUBLIST_ID, fieldId: 'custpage_col_activo', line }),
            prontoPago: rec.getSublistValue({ sublistId: SUBLIST_ID, fieldId: 'custpage_col_prontopago', line }),
            rebate: rec.getSublistValue({ sublistId: SUBLIST_ID, fieldId: 'custpage_col_rebate', line }),
            crecimiento: rec.getSublistValue({ sublistId: SUBLIST_ID, fieldId: 'custpage_col_crecimiento', line })
        };
    }

    function validateField(context) {
        const { sublistId, fieldId, currentRecord: rec } = context;

        if (sublistId !== SUBLIST_ID) return true;

        if (CAMPOS_PERCENT.indexOf(fieldId) !== -1) {
            const valorRaw = rec.getCurrentSublistValue({ sublistId, fieldId });
            const valor = parseFloat(valorRaw);

            console.log(`CS_VistaB.validateField -> campo: ${fieldId} | valor: ${valorRaw}`);

            if (valorRaw === '' || valorRaw === null) return true; // permitir vacío, se trata como 0 al guardar

            if (isNaN(valor) || valor < PORCENTAJE_MIN || valor > PORCENTAJE_MAX) {
                console.warn(`CS_VistaB.validateField -> valor fuera de rango (${PORCENTAJE_MIN}-${PORCENTAJE_MAX}):`, valor);
                alert(`El porcentaje debe ser un número entre ${PORCENTAJE_MIN} y ${PORCENTAJE_MAX} (se permiten decimales).`);
                rec.setCurrentSublistValue({ sublistId, fieldId, value: '' });
                return false;
            }
        }

        return true;
    }

    /**
     * Se dispara al confirmar (Add/OK) un renglón del sublist, ya sea
     * nuevo o editado. Aquí evitamos que el mismo Artículo quede
     * duplicado en la tabla, y (NUEVO) evitamos que se agregue un
     * Artículo que no corresponda al Proveedor seleccionado.
     */
    function validateLine(context) {
        const { sublistId, currentRecord: rec } = context;

        if (sublistId !== SUBLIST_ID) return true;

        const itemActual = rec.getCurrentSublistValue({ sublistId, fieldId: 'custpage_col_item' });

        if (!itemActual) {
            alert('Selecciona un Artículo para esta línea.');
            return false;
        }

        // ---- NUEVO: el Artículo debe pertenecer al catálogo del Proveedor ----
        // Si articulosPermitidos viene vacío, significa que el Proveedor no
        // tiene historial de Purchase Order/Bill (ej. proveedor nuevo o de
        // prueba) -> no se restringe, para no bloquear casos legítimos.
        if (articulosPermitidos.length > 0 && articulosPermitidos.indexOf(String(itemActual)) === -1) {
            console.warn('CS_VistaB.validateLine -> Artículo rechazado, no pertenece al Proveedor:', itemActual);
            alert('Ese Artículo no corresponde a este Proveedor (no aparece en su historial de Órdenes de Compra / Facturas). Selecciona un Artículo que sí haya sido comprado a este Proveedor.');
            return false;
        }
        // ------------------------------------------------------------------

        const lineaActual = rec.getCurrentSublistIndex({ sublistId });
        const lineCount = rec.getLineCount({ sublistId });

        for (let i = 0; i < lineCount; i++) {
            if (i === lineaActual) continue;

            const itemExistente = rec.getSublistValue({ sublistId, fieldId: 'custpage_col_item', line: i });
            if (String(itemExistente) === String(itemActual)) {
                alert('Ese artículo ya está en la lista.');
                return false;
            }
        }

        return true;
    }

    function saveRecord(context) {
        const rec = context.currentRecord;
        const lineCount = rec.getLineCount({ sublistId: SUBLIST_ID });
        const cambios = [];

        for (let i = 0; i < lineCount; i++) {
            const actual = snapshotLinea(rec, i);
            const original = lineasOriginales[i];

            const esNueva = !actual.id;
            const cambio = !original ||
                String(original.activo) !== String(actual.activo) ||
                String(original.prontoPago) !== String(actual.prontoPago) ||
                String(original.rebate) !== String(actual.rebate) ||
                String(original.crecimiento) !== String(actual.crecimiento);

            if (esNueva || cambio) {
                cambios.push({
                    id: actual.id || null,
                    item: actual.item,
                    activo: actual.activo === 'T' || actual.activo === true,
                    prontoPago: parseFloat(actual.prontoPago) || 0,
                    rebate: parseFloat(actual.rebate) || 0,
                    crecimiento: parseFloat(actual.crecimiento) || 0
                });
            }
        }

        console.log('CS_VistaB.saveRecord -> cambios detectados:', cambios);

        if (cambios.length === 0) {
            // Nada que guardar; se permite cerrar sin lanzar el Map/Reduce
            rec.setValue({ fieldId: 'custpage_payload', value: '[]' });
            console.log('CS_VistaB.saveRecord -> sin cambios, se guarda payload vacío.');
            return true;
        }

        rec.setValue({ fieldId: 'custpage_payload', value: JSON.stringify(cambios) });

        return true; // continúa el submit nativo -> POST al Suitelet Vista B
    }

    return {
        pageInit: pageInit,
        validateField: validateField,
        validateLine: validateLine,
        saveRecord: saveRecord
    };
});