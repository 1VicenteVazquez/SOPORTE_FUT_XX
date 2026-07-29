/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope SameAccount
 *
 * Script:      cs_recepciones_masivas_po.js
 * Descripcion: Client Script para recepcion masiva de POs.
 *              Complementos: ss_recepciones_masivas_po.js / 
 */

define(['N/ui/dialog', 'N/log'], (dialog, log) => {

    let _confirmed = false;

    const pageInit = () => {
        window.onMasterChange  = onMasterChange;
        window.onItemChange    = onItemChange;
        window.selectAll       = selectAll;
        window.deselectAll     = deselectAll;
        window.applyFilters    = applyFilters;
        window.clearFilters    = clearFilters;
        window.submitReception = submitReception;
        log.debug({ title: 'CS Init', details: 'cs_recepciones_masivas_po cargado.' });
    };

    // ── Checkbox de PO: marca/desmarca todos sus ítems ──────────────────────
    const onMasterChange = (cb) => {
        const poId        = cb.getAttribute('data-po-id');
        const vendor      = cb.getAttribute('data-vendor');
        const vendorError = document.getElementById('vendor-error');

        if (cb.checked) {
            if (window._selectedVendor && window._selectedVendor !== vendor) {
                cb.checked = false;
                vendorError.style.display = 'block';
                return;
            }
            window._selectedVendor = vendor;
            vendorError.style.display = 'none';
        } else {
            const anyChecked = document.querySelectorAll('.po-master-cb:checked').length > 0;
            if (!anyChecked) window._selectedVendor = null;
            vendorError.style.display = 'none';
        }

        document.querySelectorAll(`.item-cb[data-po-id="${poId}"]`).forEach(itemCb => {
            itemCb.checked = cb.checked;
        });
    };

    // ── Checkbox de ítem individual ─────────────────────────────────────────
    const onItemChange = (cb) => {
        const poId   = cb.getAttribute('data-po-id');
        const vendor = cb.getAttribute('data-vendor');
        const vendorError = document.getElementById('vendor-error');

        if (cb.checked) {
            if (window._selectedVendor && window._selectedVendor !== vendor) {
                cb.checked = false;
                vendorError.style.display = 'block';
                return;
            }
            window._selectedVendor = vendor;
            vendorError.style.display = 'none';
        } else {
            const anyChecked = document.querySelectorAll('.item-cb:checked').length > 0;
            if (!anyChecked) window._selectedVendor = null;
            vendorError.style.display = 'none';
        }

        syncMaster(poId);
    };

    const syncMaster = (poId) => {
        const master  = document.getElementById(`po-cb-${poId}`);
        const all     = document.querySelectorAll(`.item-cb[data-po-id="${poId}"]`);
        const checked = document.querySelectorAll(`.item-cb[data-po-id="${poId}"]:checked`);
        if (!master) return;
        master.checked       = checked.length > 0;
        master.indeterminate = checked.length > 0 && checked.length < all.length;
    };

    // ── Marcar/desmarcar todo ───────────────────────────────────────────────
    const selectAll = () => {
        let firstVendor = null;
        document.querySelectorAll('.po-master-cb').forEach(cb => {
            const vendor = cb.getAttribute('data-vendor');
            if (!firstVendor) firstVendor = vendor;
            if (vendor === firstVendor && !cb.checked) {
                cb.checked = true;
                onMasterChange(cb);
            }
        });
        if (firstVendor) window._selectedVendor = firstVendor;
    };

    const deselectAll = () => {
        document.querySelectorAll('.po-master-cb:checked').forEach(cb => {
            cb.checked = false;
            onMasterChange(cb);
        });
        window._selectedVendor = null;
        const ve = document.getElementById('vendor-error');
        if (ve) ve.style.display = 'none';
    };

    // ── Filtros ─────────────────────────────────────────────────────────────
    const applyFilters = () => {
        const vendor = document.getElementById('filter-vendor').value;
        const params = new URLSearchParams();
        if (vendor) params.set('f_vendor', vendor);
        const sep = window.SUITELET_URL.includes('?') ? '&' : '?';
        window.location.href = window.SUITELET_URL + sep + params.toString();
    };

    const clearFilters = () => { window.location.href = window.SUITELET_URL; };

    // ── Enviar ──────────────────────────────────────────────────────────────
    const submitReception = () => {
        const checkedItems = Array.from(document.querySelectorAll('.item-cb:checked'));

        if (checkedItems.length === 0) {
            dialog.alert({ title: 'Sin selección', message: 'Selecciona al menos un ítem para recepcionar.' });
            return;
        }

        const poIds        = [...new Set(checkedItems.map(cb => cb.getAttribute('data-po-id')))];
        const selectedData = [];
        const errors       = [];

        checkedItems.forEach(cb => {
            const poId    = cb.getAttribute('data-po-id');
            const lineNum = cb.getAttribute('data-line-num');
            const itemId  = cb.getAttribute('data-item-id');
            const input   = document.getElementById(`qty-${poId}-${lineNum}`);
            const pending = parseInt(input ? input.getAttribute('data-pending') : 0) || 0;
            const qty     = parseInt(input ? input.value : 0) || 0;

            if (qty <= 0) {
                errors.push(`PO ${poId} — línea ${lineNum}: la cantidad debe ser mayor a 0.`);
                return;
            }
            if (qty > pending) {
                errors.push(`PO ${poId} — línea ${lineNum}: cantidad (${qty}) excede el pendiente (${pending}).`);
                return;
            }
            selectedData.push({ poId, lineNum, itemId, qty });
        });

        if (errors.length > 0) {
            dialog.alert({ title: 'Errores en cantidades', message: errors.join('\n') });
            return;
        }

        // Confirmación — ahora menciona que es en segundo plano
        dialog.confirm({
            title:   'Confirmar Recepción',
            message: `¿Deseas recepcionar ${checkedItems.length} ítem(s) de ${poIds.length} PO(s) `
                    + `del proveedor "${window._selectedVendor}"?\n\n`
                    + `El proceso se ejecutará en segundo plano.\n`
                    + `Recibirás un correo cuando finalice.`
        }).then(confirmed => {
            if (!confirmed) return;
            document.getElementById('custpage_selected_ids').value = JSON.stringify(selectedData);
            _confirmed = true;
            document.forms[0].submit();
        }).catch(e => {
            log.error({ title: 'Error en confirmación', details: e.message });
        });
    };

    const saveRecord = () => {
        if (_confirmed) { _confirmed = false; return true; }
        submitReception();
        return false;
    };

    return { pageInit, saveRecord };
});