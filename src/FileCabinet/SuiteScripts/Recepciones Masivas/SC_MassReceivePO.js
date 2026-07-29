/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 *
 * Script:      SC_MassReceivePO.js
 * Descripcion: Suitelet para recepcion masiva de Purchase Orders.
 *              Complemento del Client Script cs_recepciones_masivas_po.js.
 */

define([
    'N/ui/serverWidget',
    'N/search',
    'N/record',
    'N/email',
    'N/runtime',
    'N/url',
    'N/log'
], (serverWidget, search, record, email, runtime, url, log) => {

    const GOVERNANCE_THRESHOLD = 300;
    const UNITS_PER_RECEIPT    = 50;

    const onRequest = (context) => {
        if (context.request.method === 'GET') {
            renderPage(context);
        } else {
            processReceipts(context);
        }
    };

    // ══════════════════════════════════════════════════════════════════════════
    // GET - Renderiza la pagina con filtro de proveedor y lista de POs
    // ══════════════════════════════════════════════════════════════════════════
    const renderPage = (context) => {
        const governanceInfo   = getGovernanceInfo();
        const selectedVendorId = context.request.parameters.custpage_vendor_filter || '';

        const form = serverWidget.createForm({ title: 'Recepcion Masiva de Purchase Orders' });
        form.clientScriptModulePath = '/SuiteScripts/Recepciones Masivas/cs_recepciones_masivas_po.js';

        // ── Grupo: Filtro de Proveedor ─────────────────────────────────────────
        form.addFieldGroup({
            id:    'grp_filter',
            label: 'Filtrar por Proveedor'
        });

        const allPOs    = getPendingPOs();
        const vendorMap = buildVendorMap(allPOs);

        const vendorFilter = form.addField({
            id:        'custpage_vendor_filter',
            type:      serverWidget.FieldType.SELECT,
            label:     'Proveedor',
            container: 'grp_filter'
        });

        vendorFilter.addSelectOption({ value: '', text: '— Todos los proveedores —' });
        Object.entries(vendorMap).forEach(([id, name]) => {
            vendorFilter.addSelectOption({ value: id, text: name });
        });
        vendorFilter.defaultValue = selectedVendorId;

        // ── Grupo: Gobernanza ─────────────────────────────────────────────────
        form.addFieldGroup({
            id:    'grp_governance',
            label: 'Informacion de Gobernanza'
        });

        form.addField({
            id:        'custpage_remaining_units',
            type:      serverWidget.FieldType.INTEGER,
            label:     'Unidades de Gobernanza Disponibles',
            container: 'grp_governance'
        }).defaultValue = governanceInfo.remaining;

        form.addField({
            id:        'custpage_max_receipts',
            type:      serverWidget.FieldType.INTEGER,
            label:     'Maximo de POs Recepcionables en Esta Ejecucion',
            container: 'grp_governance'
        }).defaultValue = governanceInfo.maxReceipts;

        const govWarningField = form.addField({
            id:        'custpage_gov_warning',
            type:      serverWidget.FieldType.INLINEHTML,
            label:     ' ',
            container: 'grp_governance'
        });

        if (governanceInfo.remaining < GOVERNANCE_THRESHOLD) {
            govWarningField.defaultValue = `
                <div style="color:#c0392b; font-weight:bold; padding:6px 0;">
                    Gobernanza baja (${governanceInfo.remaining} unidades).
                    Se recomienda esperar antes de ejecutar recepciones masivas.
                </div>`;
        } else {
            govWarningField.defaultValue = `
                <div style="color:#27ae60; font-weight:bold; padding:6px 0;">
                    Gobernanza suficiente. Puedes recepcionar hasta <strong>${governanceInfo.maxReceipts}</strong> POs.
                </div>`;
        }

        // ── Campo oculto: IDs seleccionados ───────────────────────────────────
        form.addField({
            id:   'custpage_selected_ids',
            type: serverWidget.FieldType.LONGTEXT,
            label:'IDs Seleccionados'
        }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });

        // ── Campo oculto: mapa de proveedores por linea ───────────────────────
        form.addField({
            id:   'custpage_vendor_map',
            type: serverWidget.FieldType.LONGTEXT,
            label:'Mapa de Proveedores'
        }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });

        // ── Campo oculto: URL base del Suitelet ───────────────────────────────
        const suiteletBaseUrl = url.resolveScript({
            scriptId:     runtime.getCurrentScript().id,
            deploymentId: runtime.getCurrentScript().deploymentId
        });

        form.addField({
            id:   'custpage_suitelet_url',
            type: serverWidget.FieldType.TEXT,
            label:'URL Base'
        }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });

        form.getField({ id: 'custpage_suitelet_url' }).defaultValue = suiteletBaseUrl;

        // ── Sublist ───────────────────────────────────────────────────────────
        const sublist = form.addSublist({
            id:    'custpage_po_list',
            type:  serverWidget.SublistType.LIST,
            label: selectedVendorId
                ? 'Purchase Orders pendientes — ' + (vendorMap[selectedVendorId] || selectedVendorId)
                : 'Purchase Orders Pendientes de Recepcion (Todos los Proveedores)'
        });

        sublist.addField({ id: 'custpage_sel',         type: serverWidget.FieldType.CHECKBOX, label: 'Seleccionar' });
        sublist.addField({ id: 'custpage_po_id',       type: serverWidget.FieldType.TEXT,     label: 'ID Interno' });
        sublist.addField({ id: 'custpage_po_num',      type: serverWidget.FieldType.TEXT,     label: '# de PO' });
        sublist.addField({ id: 'custpage_vendor',      type: serverWidget.FieldType.TEXT,     label: 'Proveedor' });
        sublist.addField({ id: 'custpage_vendor_id',   type: serverWidget.FieldType.TEXT,     label: 'ID Proveedor' });
        sublist.addField({ id: 'custpage_date',        type: serverWidget.FieldType.TEXT,     label: 'Fecha' });
        sublist.addField({ id: 'custpage_amount',      type: serverWidget.FieldType.CURRENCY, label: 'Monto Total' });
        sublist.addField({ id: 'custpage_qty_ordered', type: serverWidget.FieldType.INTEGER,  label: 'Cantidad Ordenada' });
        sublist.addField({ id: 'custpage_qty_billed',  type: serverWidget.FieldType.INTEGER,  label: 'Cantidad Recibida' });
        sublist.addField({ id: 'custpage_memo',        type: serverWidget.FieldType.TEXT,     label: 'Memo' });

        const pendingPOs = selectedVendorId
            ? allPOs.filter(po => String(po.vendorId) === String(selectedVendorId))
            : allPOs;

        const lineVendorMap = {};

        pendingPOs.forEach((po, idx) => {
            lineVendorMap[idx] = { id: po.vendorId, name: po.vendor };

            sublist.setSublistValue({ id: 'custpage_sel',       line: idx, value: 'F' });
            sublist.setSublistValue({ id: 'custpage_po_id',     line: idx, value: String(po.id       || ' ') });
            sublist.setSublistValue({ id: 'custpage_po_num',    line: idx, value: String(po.tranid   || ' ') });
            sublist.setSublistValue({ id: 'custpage_vendor',    line: idx, value: String(po.vendor   || ' ') });
            sublist.setSublistValue({ id: 'custpage_vendor_id', line: idx, value: String(po.vendorId || ' ') });
            sublist.setSublistValue({ id: 'custpage_date',      line: idx, value: String(po.trandate || ' ') });
            sublist.setSublistValue({ id: 'custpage_memo',      line: idx, value: String(po.memo     || ' ') });

            sublist.setSublistValue({ id: 'custpage_amount',      line: idx, value: parseFloat(po.amount)     || 0 });
            sublist.setSublistValue({ id: 'custpage_qty_ordered', line: idx, value: parseFloat(po.qtyOrdered) || 0 });
            sublist.setSublistValue({ id: 'custpage_qty_billed',  line: idx, value: parseFloat(po.qtyBilled)  || 0 });
        });

        form.getField({ id: 'custpage_vendor_map' }).defaultValue = JSON.stringify(lineVendorMap);

        // ── Botones ───────────────────────────────────────────────────────────
        form.addButton({
            id:           'custpage_btn_select_all',
            label:        'Seleccionar Todo',
            functionName: 'selectAll'
        });

        form.addButton({
            id:           'custpage_btn_deselect_all',
            label:        'Deseleccionar Todo',
            functionName: 'deselectAll'
        });

        form.addSubmitButton({ label: 'Recepcionar Seleccionadas' });

        context.response.writePage(form);
    };

    // ══════════════════════════════════════════════════════════════════════════
    // POST - Procesa directamente las POs seleccionadas
    // ══════════════════════════════════════════════════════════════════════════
    const processReceipts = (context) => {
        const params      = context.request.parameters;
        const currentUser = runtime.getCurrentUser();

        let selectedIds = [];
        try {
            const rawIds = params.custpage_selected_ids || '[]';
            selectedIds  = JSON.parse(rawIds).filter(id => id);
        } catch (e) {
            log.error({ title: 'Parse Error', details: e.message });
        }

        if (!selectedIds.length) {
            renderResultPage(context, { received: [], errors: [], noSelection: true });
            return;
        }

        const governanceInfo = getGovernanceInfo();
        if (selectedIds.length > governanceInfo.maxReceipts) {
            log.audit({
                title:   'Gobernanza insuficiente',
                details: 'Seleccionadas: ' + selectedIds.length + ', Maximo permitido: ' + governanceInfo.maxReceipts
            });
            selectedIds = selectedIds.slice(0, governanceInfo.maxReceipts);
        }

        const received = [];
        const errors   = [];

        for (const poId of selectedIds) {
            try {
                const poRecord = record.load({ type: record.Type.PURCHASE_ORDER, id: poId });
                const tranId   = poRecord.getValue({ fieldId: 'tranid' });

                const receiptId = receiveFullPO(poId);
                received.push({ poId, tranId, receiptId });
                log.audit({ title: 'PO Recepcionada', details: 'PO ' + tranId + ' (ID: ' + poId + ') -> Item Receipt ID: ' + receiptId });
            } catch (e) {
                errors.push({ id: poId, msg: e.message });
                log.error({ title: 'Error recepcionando PO ' + poId, details: e.message });
            }
        }

        if (received.length > 0) {
            sendReceiptEmail(currentUser, received, errors);
        }

        renderResultPage(context, { received, errors, noSelection: false });
    };

    // ══════════════════════════════════════════════════════════════════════════
    // Pagina de Resultados con animacion de entrada
    // ══════════════════════════════════════════════════════════════════════════
    const renderResultPage = (context, { received, errors, noSelection }) => {
        const form = serverWidget.createForm({ title: 'Resultado de Recepcion Masiva' });

        const htmlField = form.addField({
            id:    'custpage_result_html',
            type:  serverWidget.FieldType.INLINEHTML,
            label: ' '
        });

        let html = `
        <style>
            @keyframes fadeInUp {
                from { opacity: 0; transform: translateY(24px); }
                to   { opacity: 1; transform: translateY(0);    }
            }
            @keyframes barFill {
                from { width: 0%; }
                to   { width: 100%; }
            }
            .result-card {
                animation: fadeInUp 0.5s ease forwards;
                opacity: 0;
            }
            .result-card:nth-child(1) { animation-delay: 0.1s; }
            .result-card:nth-child(2) { animation-delay: 0.3s; }
        </style>
        <div style="font-family:Arial,sans-serif; max-width:760px; margin:20px auto;">

            <!-- Barra de completado animada -->
            <div style="background:#ecf0f1; border-radius:50px; height:8px; overflow:hidden; margin-bottom:24px;">
                <div style="
                    height: 100%;
                    border-radius: 50px;
                    background: linear-gradient(90deg, #27ae60, #2ecc71);
                    animation: barFill 0.8s ease forwards;
                    width: 0%;
                "></div>
            </div>
        `;

        if (noSelection) {
            html += `
            <div class="result-card" style="background:#fef9e7; border-left:4px solid #f39c12; padding:16px; border-radius:4px;">
                <strong>Sin seleccion</strong><br>No seleccionaste ninguna PO para recepcionar.
            </div>`;
        } else {
            if (received.length > 0) {
                const rows = received.map(r =>
                    '<tr>' +
                        '<td style="padding:6px 12px; border-bottom:1px solid #d5f5e3;">' + (r.tranId || '—') + '</td>' +
                        '<td style="padding:6px 12px; border-bottom:1px solid #d5f5e3;">' + r.poId + '</td>' +
                        '<td style="padding:6px 12px; border-bottom:1px solid #d5f5e3;"><strong>' + r.receiptId + '</strong></td>' +
                    '</tr>'
                ).join('');

                html += `
                <div class="result-card" style="background:#eafaf1; border-left:4px solid #27ae60; padding:16px; border-radius:4px; margin-bottom:16px;">
                    <strong>${received.length} PO(s) recepcionadas correctamente</strong>
                    <table style="margin-top:12px; border-collapse:collapse; width:100%;">
                        <thead>
                            <tr style="background:#d5f5e3;">
                                <th style="padding:6px 12px; text-align:left;"># de PO</th>
                                <th style="padding:6px 12px; text-align:left;">ID Interno PO</th>
                                <th style="padding:6px 12px; text-align:left;">ID Item Receipt</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>`;
            }

            if (errors.length > 0) {
                const errList = errors.map(e => '<li>ID ' + e.id + ': ' + e.msg + '</li>').join('');
                html += `
                <div class="result-card" style="background:#fdedec; border-left:4px solid #c0392b; padding:16px; border-radius:4px;">
                    <strong>${errors.length} PO(s) con error</strong>
                    <ul style="margin:8px 0 0 0;">${errList}</ul>
                </div>`;
            }
        }

        const suiteletUrl = url.resolveScript({
            scriptId:     runtime.getCurrentScript().id,
            deploymentId: runtime.getCurrentScript().deploymentId
        });

        html += `
            <br>
            <a href="${suiteletUrl}" style="display:inline-block; background:#2c3e50; color:white;
                padding:10px 20px; border-radius:4px; text-decoration:none; font-weight:bold;
                animation: fadeInUp 0.5s ease 0.5s forwards; opacity:0;">
                Volver a la lista
            </a>
        </div>`;

        htmlField.defaultValue = html;
        context.response.writePage(form);
    };

    // ── Helpers ───────────────────────────────────────────────────────────────

    const receiveFullPO = (poId) => {
        const receipt = record.transform({
            fromType:  record.Type.PURCHASE_ORDER,
            fromId:    poId,
            toType:    record.Type.ITEM_RECEIPT,
            isDynamic: true
        });

        const lineCount = receipt.getLineCount({ sublistId: 'item' });
        for (let i = 0; i < lineCount; i++) {
            receipt.selectLine({ sublistId: 'item', line: i });
            const qtyRemaining = receipt.getCurrentSublistValue({ sublistId: 'item', fieldId: 'quantity' });
            receipt.setCurrentSublistValue({
                sublistId: 'item',
                fieldId:   'itemreceive',
                value:     !!(qtyRemaining && parseFloat(qtyRemaining) > 0)
            });
            receipt.commitLine({ sublistId: 'item' });
        }

        return receipt.save({ enableSourcing: false, ignoreMandatoryFields: false });
    };

    const getPendingPOs = () => {
        const results  = [];
        const poSearch = search.create({
            type: search.Type.PURCHASE_ORDER,
            filters: [
                ['status', search.Operator.ANYOF, ['PurchOrd:B', 'PurchOrd:D']],
                'AND',
                ['mainline', search.Operator.IS, 'T']
            ],
            columns: [
                search.createColumn({ name: 'tranid' }),
                search.createColumn({ name: 'entity' }),
                search.createColumn({ name: 'trandate' }),
                search.createColumn({ name: 'amount' }),
                search.createColumn({ name: 'quantity' }),
                search.createColumn({ name: 'quantityshiprecv' }),
                search.createColumn({ name: 'memo' })
            ]
        });

        poSearch.run().each((result) => {
            results.push({
                id:         result.id,
                tranid:     result.getValue('tranid')           || '',
                vendorId:   result.getValue('entity')           || '',
                vendor:     result.getText('entity')            || '',
                trandate:   result.getValue('trandate')         || '',
                amount:     result.getValue('amount')           || '0',
                qtyOrdered: result.getValue('quantity')         || '0',
                qtyBilled:  result.getValue('quantityshiprecv') || '0',
                memo:       result.getValue('memo')             || ''
            });
            return true;
        });

        return results;
    };

    const buildVendorMap = (pos) => {
        const map = {};
        pos.forEach(po => {
            if (po.vendorId && !map[po.vendorId]) {
                map[po.vendorId] = po.vendor;
            }
        });
        return map;
    };

    const getGovernanceInfo = () => {
        const script      = runtime.getCurrentScript();
        const remaining   = script.getRemainingUsage();
        const usable      = Math.max(0, remaining - GOVERNANCE_THRESHOLD);
        const maxReceipts = Math.floor(usable / UNITS_PER_RECEIPT);
        return { remaining, maxReceipts };
    };

    const sendReceiptEmail = (currentUser, received, errors) => {
        const receivedList = received
            .map(r => '# PO: ' + (r.tranId || r.poId) + '  |  ID Interno: ' + r.poId + '  |  Item Receipt ID: ' + r.receiptId)
            .join('\n');
        const errorList = errors.length
            ? '\n\nPOs con error:\n' + errors.map(e => 'ID ' + e.id + ': ' + e.msg).join('\n')
            : '';

        const subject = '[NetSuite] Recepcion Masiva de POs - ' + received.length + ' orden(es) recepcionada(s)';
        const body    = 'Hola ' + currentUser.name + ',\n\n'
            + 'Has completado una recepcion masiva de Purchase Orders.\n\n'
            + 'POs Recepcionadas (' + received.length + '):\n' + receivedList
            + errorList
            + '\n\nFecha y hora: ' + new Date().toLocaleString('es-MX')
            + '\n\n- NetSuite | Recepciones Masivas';

        try {
            email.send({
                author:     currentUser.id,
                recipients: [currentUser.email],
                subject,
                body
            });
            log.audit({ title: 'Email enviado', details: 'A: ' + currentUser.email });
        } catch (e) {
            log.error({ title: 'Error enviando email', details: e.message });
        }
    };

    return { onRequest };
});