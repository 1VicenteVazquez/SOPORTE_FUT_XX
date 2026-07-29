/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope SameAccount
 *
 * Script:      cs_recepciones_masivas_po.js
 * Descripcion: Client Script para la recepcion masiva de Purchase Orders.
 *              Complemento del Suitelet SC_MassReceivePO.js.
 */

define(['N/currentRecord', 'N/ui/dialog', 'N/log'], (currentRecord, dialog, log) => {

    const SUBLIST_ID    = 'custpage_po_list';
    const COL_SEL       = 'custpage_sel';
    const COL_PO_ID     = 'custpage_po_id';
    const COL_VENDOR_ID = 'custpage_vendor_id';
    const COL_VENDOR    = 'custpage_vendor';
    const FIELD_IDS     = 'custpage_selected_ids';

    let _confirmed = false;

    const pageInit = (scriptContext) => {
        log.debug({ title: 'CS Init', details: 'Client Script de Recepciones Masivas cargado.' });
    };

    const fieldChanged = (scriptContext) => {
        if (scriptContext.fieldId !== 'custpage_vendor_filter') return;

        try {
            const rec      = scriptContext.currentRecord;
            const vendorId = rec.getValue({ fieldId: 'custpage_vendor_filter' }) || '';
            const baseUrl  = rec.getValue({ fieldId: 'custpage_suitelet_url' })  || '';

            if (!baseUrl) return;

            window.onbeforeunload = null;
            const separator = baseUrl.includes('?') ? '&' : '?';
            window.location.href = baseUrl + separator + 'custpage_vendor_filter=' + encodeURIComponent(vendorId);

        } catch (e) {
            log.error({ title: 'Error en fieldChanged', details: e.message });
            dialog.alert({ title: 'Error', message: 'No se pudo aplicar el filtro: ' + e.message });
        }
    };

    const selectAll = () => {
        try {
            const rec       = currentRecord.get();
            const lineCount = rec.getLineCount({ sublistId: SUBLIST_ID });

            if (lineCount === 0) {
                dialog.alert({ title: 'Sin POs', message: 'No hay Purchase Orders pendientes de recepcion.' });
                return;
            }

            for (let i = 0; i < lineCount; i++) {
                rec.selectLine({ sublistId: SUBLIST_ID, line: i });
                rec.setCurrentSublistValue({ sublistId: SUBLIST_ID, fieldId: COL_SEL, value: true });
                rec.commitLine({ sublistId: SUBLIST_ID });
            }
        } catch (e) {
            log.error({ title: 'Error en selectAll', details: e.message });
            dialog.alert({ title: 'Error', message: 'Ocurrio un error al seleccionar todas las POs: ' + e.message });
        }
    };

    const deselectAll = () => {
        try {
            const rec       = currentRecord.get();
            const lineCount = rec.getLineCount({ sublistId: SUBLIST_ID });

            for (let i = 0; i < lineCount; i++) {
                rec.selectLine({ sublistId: SUBLIST_ID, line: i });
                rec.setCurrentSublistValue({ sublistId: SUBLIST_ID, fieldId: COL_SEL, value: false });
                rec.commitLine({ sublistId: SUBLIST_ID });
            }
        } catch (e) {
            log.error({ title: 'Error en deselectAll', details: e.message });
            dialog.alert({ title: 'Error', message: 'Ocurrio un error al deseleccionar las POs: ' + e.message });
        }
    };

    const saveRecord = (scriptContext) => {
        try {
            const rec         = scriptContext.currentRecord;
            const lineCount   = rec.getLineCount({ sublistId: SUBLIST_ID });
            const selectedIds = [];
            const vendorIds   = new Set();
            const vendorNames = {};

            for (let i = 0; i < lineCount; i++) {
                const isChecked = rec.getSublistValue({
                    sublistId: SUBLIST_ID,
                    fieldId:   COL_SEL,
                    line:      i
                });

                if (isChecked === true || isChecked === 'T') {
                    const poId     = rec.getSublistValue({ sublistId: SUBLIST_ID, fieldId: COL_PO_ID,     line: i });
                    const vendorId = rec.getSublistValue({ sublistId: SUBLIST_ID, fieldId: COL_VENDOR_ID,  line: i });
                    const vendor   = rec.getSublistValue({ sublistId: SUBLIST_ID, fieldId: COL_VENDOR,     line: i });

                    if (poId) {
                        selectedIds.push(poId);
                        vendorIds.add(String(vendorId).trim());
                        vendorNames[String(vendorId).trim()] = vendor;
                    }
                }
            }

            if (selectedIds.length === 0) {
                dialog.alert({
                    title:   'Sin seleccion',
                    message: 'Debes seleccionar al menos una Purchase Order para recepcionar.'
                });
                return false;
            }

            if (vendorIds.size > 1) {
                const namesFound = [...vendorIds].map(id => vendorNames[id] || id).join('\n• ');
                dialog.alert({
                    title:   'Proveedores Mixtos',
                    message: 'No puedes recepcionar POs de distintos proveedores en una misma operacion.\n\n'
                            + 'Proveedores detectados en tu seleccion:\n• ' + namesFound + '\n\n'
                            + 'Por favor usa el filtro de proveedor para ver solo las POs de un proveedor a la vez, '
                            + 'o deselecciona las ordenes de los demas proveedores.'
                });
                return false;
            }

            if (_confirmed) {
                _confirmed = false;
                return true;
            }

            const vendorName = vendorNames[String([...vendorIds][0]).trim()] || 'Proveedor desconocido';

            dialog.confirm({
                title:   'Confirmar Recepcion',
                message: 'Esta seguro de que deseas recepcionar ' + selectedIds.length + ' Purchase Order(s) '
                        + 'del proveedor "' + vendorName + '"?\n\n'
                        + 'Esta accion creara un Item Receipt por cada PO seleccionada.'
            }).then((result) => {
                if (!result) return;

                rec.setValue({ fieldId: FIELD_IDS, value: JSON.stringify(selectedIds) });

                log.debug({
                    title:   'saveRecord confirmed',
                    details: 'Enviando ' + selectedIds.length + ' POs: ' + selectedIds.join(', ')
                });

                _confirmed = true;
                document.getElementById('submitter').click();
            });

            return false;

        } catch (e) {
            log.error({ title: 'Error en saveRecord', details: e.message });
            dialog.alert({ title: 'Error', message: 'Ocurrio un error al procesar la seleccion: ' + e.message });
            return false;
        }
    };

    return {
        pageInit,
        fieldChanged,
        saveRecord,
        selectAll,
        deselectAll
    };
});