/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 *
 * CS_CondicionesComerciales_VistaB.js
 *
 * - Valida que Pronto Pago / Rebate / Crecimiento estén entre 0 y 20
 *   (decimales permitidos, ej. 4.5).
 * - Permite agregar un Artículo nuevo a la cuadrícula (sin guardar aún).
 * - Al guardar, detecta qué líneas cambiaron respecto al estado original
 *   y arma el JSON que el Suitelet (Vista B) recibirá por POST.
 */
define(['N/currentRecord'], (currentRecord) => {

    const SUBLIST_ID = 'custpage_sublist';
    const CAMPOS_PERCENT = ['custpage_col_prontopago', 'custpage_col_rebate', 'custpage_col_crecimiento'];

    const PORCENTAJE_MIN = 0;
    const PORCENTAJE_MAX = 20;

    let lineasOriginales = {};

    function pageInit(context) {
        const rec = context.currentRecord;
        const lineCount = rec.getLineCount({ sublistId: SUBLIST_ID });

        console.log('CS_VistaB.pageInit -> líneas cargadas:', lineCount);

        lineasOriginales = {};
        for (let i = 0; i < lineCount; i++) {
            lineasOriginales[i] = snapshotLinea(rec, i);
        }

        console.log('CS_VistaB.pageInit -> snapshot original:', lineasOriginales);
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

    function agregarLinea(context) {
        const rec = context.currentRecord;
        const nuevoItem = rec.getValue({ fieldId: 'custpage_nuevo_item' });

        console.log('CS_VistaB.agregarLinea -> nuevoItem:', nuevoItem);

        if (!nuevoItem) {
            alert('Selecciona un artículo para agregar.');
            return;
        }

        const lineCount = rec.getLineCount({ sublistId: SUBLIST_ID });
        for (let i = 0; i < lineCount; i++) {
            const existente = rec.getSublistValue({ sublistId: SUBLIST_ID, fieldId: 'custpage_col_item', line: i });
            if (String(existente) === String(nuevoItem)) {
                alert('Ese artículo ya está en la lista.');
                return;
            }
        }

        rec.selectNewLine({ sublistId: SUBLIST_ID });
        rec.setCurrentSublistValue({ sublistId: SUBLIST_ID, fieldId: 'custpage_col_item', value: nuevoItem });
        rec.setCurrentSublistValue({ sublistId: SUBLIST_ID, fieldId: 'custpage_col_activo', value: 'T' });
        rec.setCurrentSublistValue({ sublistId: SUBLIST_ID, fieldId: 'custpage_col_prontopago', value: 0 });
        rec.setCurrentSublistValue({ sublistId: SUBLIST_ID, fieldId: 'custpage_col_rebate', value: 0 });
        rec.setCurrentSublistValue({ sublistId: SUBLIST_ID, fieldId: 'custpage_col_crecimiento', value: 0 });
        rec.commitLine({ sublistId: SUBLIST_ID });

        rec.setValue({ fieldId: 'custpage_nuevo_item', value: '' });

        console.log('CS_VistaB.agregarLinea -> línea agregada, total líneas ahora:', rec.getLineCount({ sublistId: SUBLIST_ID }));

        // Nueva línea no tiene snapshot original -> se detectará como cambio al guardar
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
        agregarLinea: agregarLinea,
        saveRecord: saveRecord
    };
});