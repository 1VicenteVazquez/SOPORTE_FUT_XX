/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 *
 * Script:      ss_recepciones_masivas_po.js
 * Descripcion: Suitelet para recepcion masiva de Purchase Orders.
 *              En POST crea un job record y dispara el Map/Reduce en segundo plano.
 *              Complementos: cs_recepciones_masivas_po.js / mr_recepciones_masivas_po.js
 *
 * Custom Record requerido: customrecord_recep_masiva_job
 *   custrecord_recep_job_payload  → Long Text
 *   custrecord_recep_job_status   → Text
 *   custrecord_recep_job_userid   → Integer
 *   custrecord_recep_job_useremail→ Text
 *   custrecord_recep_job_username → Text
 *   custrecord_recep_job_results  → Long Text
 *
 * Parámetro del script MR: custscript_recep_mr_job_id  (Free-Form Text)
 * Script ID del MR:        customscript_mr_recep_masivas_po
 * Deployment ID del MR:    customdeploy_mr_recep_masivas_po
 */

define([
    'N/ui/serverWidget',
    'N/search',
    'N/record',
    'N/task',
    'N/runtime',
    'N/url',
    'N/log'
], (serverWidget, search, record, task, runtime, url, log) => {

    // ── IDs del Map/Reduce — ajusta si los tuyos son distintos ───────────────
    const MR_SCRIPT_ID     = 'customscript_mr_recep_masivas_po';
    const MR_DEPLOYMENT_ID = 'customdeploy_mr_recep_masivas_po';
    const JOB_RECORD_TYPE  = 'customrecord_recep_masiva_job';

    const GOVERNANCE_THRESHOLD = 100;   // Suitelet solo crea el job; puede ser bajo
    const UNITS_PER_RECEIPT    = 50;    // Referencia informativa para el banner

    const onRequest = (context) => {
        if (context.request.method === 'GET') {
            renderPage(context);
        } else {
            scheduleMapReduce(context);
        }
    };

    // ══════════════════════════════════════════════════════════════════════════
    // GET — página principal (sin cambios respecto a la versión original)
    // ══════════════════════════════════════════════════════════════════════════
    const renderPage = (context) => {
        const form = serverWidget.createForm({ title: 'Recepción Masiva de Purchase Orders' });
        form.clientScriptModulePath = '/SuiteScripts/Recepciones Masivas/v2/cs_recepciones_masivas_po.js';

        form.addField({
            id:    'custpage_selected_ids',
            type:  serverWidget.FieldType.LONGTEXT,
            label: 'IDs'
        }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });

        const suiteletUrl    = url.resolveScript({
            scriptId:     runtime.getCurrentScript().id,
            deploymentId: runtime.getCurrentScript().deploymentId
        });
        const governanceInfo = getGovernanceInfo();
        const fVendor        = context.request.parameters.f_vendor || '';

        // ── LOG gobernanza: inicio GET ────────────────────────────────────────
        log.audit({ title: 'GOV renderPage — INICIO', details: 'remaining=' + runtime.getCurrentScript().getRemainingUsage() });

        const pos = getPOsConItems(fVendor);

        log.audit({ title: 'GOV renderPage — tras getPOsConItems(fVendor)', details: 'remaining=' + runtime.getCurrentScript().getRemainingUsage() + ' | pos=' + pos.length });

        const allPos = fVendor ? getPOsConItems('') : pos;

        log.audit({ title: 'GOV renderPage — tras getPOsConItems(todos)', details: 'remaining=' + runtime.getCurrentScript().getRemainingUsage() + ' | allPos=' + allPos.length });
        const vendorsSet = [...new Set(allPos.map(p => p.vendor).filter(Boolean))].sort();
        let vendorOptions = '<option value="">-- Todos los proveedores --</option>';
        vendorsSet.forEach(v => {
            const sel = fVendor === v ? ' selected' : '';
            vendorOptions += `<option value="${escHtml(v)}"${sel}>${escHtml(v)}</option>`;
        });

        let tableRows = '';
        if (pos.length === 0) {
            tableRows = `<tr><td colspan="8" class="ns-empty-row">No hay ítems pendientes de recepción.</td></tr>`;
        } else {
            pos.forEach(po => {
                const totalPending  = po.items.reduce((s, i) => s + i.pending,  0);
                const totalReceived = po.items.reduce((s, i) => s + i.received, 0);

                const statusMap = {
                    'Pending Receipt':                   { label: 'Pend. Receipt',  cls: 'ns-st-pending' },
                    'Pending Billing':                   { label: 'Pend. Billing',  cls: 'ns-st-billed'  },
                    'Pending Billing/Partially Received':{ label: 'Part. Received', cls: 'ns-st-partial' },
                    'Partially Received':                { label: 'Part. Received', cls: 'ns-st-partial' },
                    'Pending Supervisor Approval':       { label: 'Pend. Approval', cls: 'ns-st-pending' },
                    'Fully Billed':                      { label: 'Fully Billed',   cls: 'ns-st-billed'  }
                };
                const stInfo     = statusMap[po.status] || { label: po.status || '—', cls: 'ns-st-pending' };
                const statusCell = `<span class="ns-status-badge ${stInfo.cls}">${stInfo.label}</span>`;

                tableRows += `
                <tr class="ns-po-group-row">
                    <td class="ns-grp-td ns-center">
                        <input type="checkbox" class="po-master-cb"
                            id="po-cb-${po.id}"
                            data-po-id="${po.id}"
                            data-vendor="${escHtml(po.vendor)}"
                            onchange="onMasterChange(this)">
                    </td>
                    <td class="ns-grp-td ns-link-cell">${escHtml(po.tranid)}</td>
                    <td class="ns-grp-td">${statusCell}</td>
                    <td class="ns-grp-td">${escHtml(po.vendor)}</td>
                    <td class="ns-grp-td">${escHtml(po.trandate)}</td>
                    <td class="ns-grp-td ns-right" style="font-weight:bold;">$${fmt(po.amount)}</td>
                    <td class="ns-grp-td ns-center">
                        ${totalReceived > 0
                            ? `<span class="ns-qty-received">${totalReceived}</span>`
                            : '<span class="ns-qty-na">—</span>'}
                    </td>
                    <td class="ns-grp-td ns-center">
                        <span class="ns-qty-pending">${totalPending}</span>
                    </td>
                </tr>`;

                tableRows += `
                <tr class="ns-item-subhdr-row">
                    <td class="ns-subhdr-td ns-center">Sel.</td>
                    <td class="ns-subhdr-td" colspan="2">Ítem</td>
                    <td class="ns-subhdr-td ns-center">Ordenado</td>
                    <td class="ns-subhdr-td ns-center">Recibido</td>
                    <td class="ns-subhdr-td ns-center">Pendiente</td>
                    <td class="ns-subhdr-td ns-center" colspan="2">Cant. a Recibir</td>
                </tr>`;

                po.items.forEach((item, idx) => {
                    const isLast = idx === po.items.length - 1;
                    tableRows += `
                <tr class="ns-item-row${isLast ? ' ns-item-last' : ''}" data-po-id="${po.id}">
                    <td class="ns-item-td ns-center">
                        <input type="checkbox" class="item-cb"
                            id="item-cb-${po.id}-${item.lineNum}"
                            data-po-id="${po.id}"
                            data-line-num="${item.lineNum}"
                            data-item-id="${item.itemId}"
                            data-vendor="${escHtml(po.vendor)}"
                            onchange="onItemChange(this)">
                    </td>
                    <td class="ns-item-td" colspan="2">
                        <span class="ns-item-indent">└</span> ${escHtml(item.itemName)}
                    </td>
                    <td class="ns-item-td ns-center">${item.ordered}</td>
                    <td class="ns-item-td ns-center">
                        ${item.received > 0
                            ? `<span class="ns-qty-received">${item.received}</span>`
                            : '<span class="ns-qty-na">—</span>'}
                    </td>
                    <td class="ns-item-td ns-center">
                        <span class="ns-qty-pending">${item.pending}</span>
                    </td>
                    <td class="ns-item-td ns-center" colspan="2">
                        <input type="number"
                            id="qty-${po.id}-${item.lineNum}"
                            class="qty-input"
                            value="${item.pending}"
                            min="1" max="${item.pending}" step="1"
                            data-po-id="${po.id}"
                            data-line-num="${item.lineNum}"
                            data-item-id="${item.itemId}"
                            data-pending="${item.pending}">
                    </td>
                </tr>`;
                });
            });
        }

        const totalItems = pos.reduce((s, p) => s + p.items.length, 0);

        const mainHtml = `
        <style>
            #ns-rec-wrap { font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif; font-size: 12px; color: #333; }
            .ns-gov-banner { padding: 7px 12px; border-radius: 2px; font-size: 11px; font-weight: bold; margin-bottom: 10px; border: 1px solid; }
            .ns-gov-ok   { background: #e8f5e9; color: #2e7d32; border-color: #c8e6c9; }
            .ns-gov-warn { background: #fff3e0; color: #e65100; border-color: #ffe0b2; }
            #ns-filter-panel { background: #fff; border: 1px solid #c8c8c8; border-top: 2px solid #0070d9; padding: 10px 14px 12px; margin-bottom: 10px; }
            .ns-filter-title { font-size: 11px; font-weight: bold; color: #0070d9; text-transform: uppercase; letter-spacing: .4px; margin-bottom: 8px; }
            #ns-filter-grid { display: flex; flex-wrap: wrap; gap: 14px 20px; align-items: flex-end; }
            #ns-filter-grid label { display: block; font-size: 11px; font-weight: bold; color: #333; margin-bottom: 3px; }
            #ns-filter-grid select { height: 22px; padding: 2px 6px; border: 1px solid #acacac; border-radius: 2px; font-size: 12px; font-family: Arial, sans-serif; color: #333; background: #fff; min-width: 200px; }
            #ns-filter-grid select:focus { outline: none; border-color: #0070d9; }
            .ns-btn { display: inline-block; height: 22px; line-height: 20px; padding: 0 10px; border: 1px solid #0070d9; border-radius: 2px; background: #0070d9; color: #fff; font-size: 11px; font-family: Arial, sans-serif; font-weight: bold; cursor: pointer; white-space: nowrap; }
            .ns-btn:hover { background: #005cb2; border-color: #005cb2; }
            .ns-btn.ns-btn-secondary { background: #fff; color: #333; border-color: #acacac; }
            .ns-btn.ns-btn-secondary:hover { background: #f0f0f0; }
            #ns-action-bar { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; flex-wrap: wrap; }
            .ns-count { margin-left: 8px; font-size: 11px; color: #666; }
            #vendor-error { display: none; background: #fff3cd; border: 1px solid #ffc107; border-left: 3px solid #e65100; padding: 7px 12px; font-size: 11px; color: #7b3f00; margin-bottom: 8px; border-radius: 2px; }
            #ns-rec-table { width: 100%; border-collapse: collapse; border: 1px solid #c8c8c8; font-size: 12px; }
            #ns-rec-table thead tr { background: #e8e8e8; }
            #ns-rec-table thead th { padding: 5px 8px; text-align: left; font-size: 11px; font-weight: bold; color: #333; border-right: 1px solid #c8c8c8; border-bottom: 1px solid #c8c8c8; white-space: nowrap; }
            .ns-po-group-row { background: #dce8f5; border-top: 2px solid #a8c4e0; }
            .ns-po-group-row:hover td { background: #ccdff0 !important; }
            .ns-grp-td { padding: 5px 8px; border-right: 1px solid #b8cfe8; vertical-align: middle; font-weight: 600; }
            .ns-link-cell { color: #0070d9; }
            .ns-item-subhdr-row { background: #f0f0f0; }
            .ns-subhdr-td { padding: 3px 8px; border-right: 1px solid #d0d0d0; font-size: 10px; font-weight: bold; color: #555; text-transform: uppercase; letter-spacing: .3px; }
            .ns-item-row { background: #f8fbff; border-top: 1px solid #e0eaf4; }
            .ns-item-row:hover td { background: #edf4fc !important; }
            .ns-item-last { border-bottom: 2px solid #a8c4e0; }
            .ns-item-td { padding: 4px 8px; border-right: 1px solid #e8e8e8; vertical-align: middle; }
            .ns-item-indent { color: #b0bec5; margin-right: 4px; font-size: 11px; }
            .ns-status-badge { display: inline-block; border-radius: 2px; padding: 2px 7px; font-size: 10px; font-weight: bold; white-space: nowrap; }
            .ns-st-pending { background: #e3f2fd; color: #1565c0; }
            .ns-st-partial { background: #fff3e0; color: #e65100; }
            .ns-st-billed  { background: #e8f5e9; color: #2e7d32; }
            .ns-qty-received { display: inline-block; background: #e8f5e9; color: #2e7d32; border-radius: 10px; padding: 1px 8px; font-size: 11px; font-weight: bold; }
            .ns-qty-pending  { display: inline-block; background: #fff3e0; color: #e65100; border-radius: 10px; padding: 1px 8px; font-size: 11px; font-weight: bold; }
            .ns-qty-na { color: #bbb; }
            .qty-input { width: 70px; height: 20px; padding: 1px 5px; border: 1px solid #acacac; border-radius: 2px; font-size: 11px; text-align: right; box-sizing: border-box; }
            .qty-input:focus { outline: none; border-color: #0070d9; }
            #ns-footer { margin-top: 14px; padding-top: 10px; border-top: 1px solid #c8c8c8; }
            #submitter { display: none !important; }
            .ns-btn-process { height: 26px; line-height: 24px; font-size: 12px; padding: 0 16px; }
            .ns-center { text-align: center; }
            .ns-right  { text-align: right; }
        </style>

        <div id="ns-rec-wrap">

            <div id="ns-filter-panel">
                <div class="ns-filter-title">Filtros de búsqueda</div>
                <div id="ns-filter-grid">
                    <div>
                        <label>Proveedor</label>
                        <select id="filter-vendor" onchange="applyFilters()">${vendorOptions}</select>
                    </div>
                    <div style="display:flex;gap:6px;align-items:flex-end;padding-bottom:1px;">
                        <button type="button" class="ns-btn ns-btn-secondary" onclick="clearFilters()">Limpiar</button>
                    </div>
                </div>
            </div>

            <div id="ns-action-bar">
                <button type="button" class="ns-btn ns-btn-secondary" onclick="selectAll()">Marcar todo</button>
                <button type="button" class="ns-btn ns-btn-secondary" onclick="deselectAll()">Desmarcar todo</button>
                <button type="button" class="ns-btn ns-btn-process" onclick="submitReception()">
                    ✓ Procesar Recepción de Seleccionadas
                </button>
                <span class="ns-count">${pos.length} PO(s) · ${totalItems} ítem(s) pendiente(s)</span>
            </div>

            <div id="vendor-error">⚠ No puedes recepcionar POs de diferentes proveedores en una misma operación.</div>

            <table id="ns-rec-table">
                <thead>
                    <tr>
                        <th style="width:32px;">Sel.</th>
                        <th style="width:80px;"># PO</th>
                        <th style="width:130px;">Status</th>
                        <th>Proveedor</th>
                        <th style="width:90px;">Fecha</th>
                        <th style="width:110px;text-align:right;">Monto</th>
                        <th style="width:80px;text-align:center;">Rec. Total</th>
                        <th style="width:80px;text-align:center;">Pend. Total</th>
                    </tr>
                </thead>
                <tbody>${tableRows}</tbody>
            </table>

            <div id="ns-footer">
                <button type="button" class="ns-btn ns-btn-process" onclick="submitReception()">
                    ✓ Procesar Recepción de Seleccionadas
                </button>
            </div>
        </div>

        <script>
            var SUITELET_URL    = '${suiteletUrl}';
            var MAX_RECEIPTS    = 9999;
            var _selectedVendor = null;
        <\/script>`;

        form.addField({
            id:    'custpage_main_html',
            type:  serverWidget.FieldType.INLINEHTML,
            label: ' '
        }).defaultValue = mainHtml;

        form.addSubmitButton({ label: 'Procesar Recepción' });
        context.response.writePage(form);
    };

    // ══════════════════════════════════════════════════════════════════════════
    // POST — crear job record y disparar Map/Reduce
    // ══════════════════════════════════════════════════════════════════════════
    const scheduleMapReduce = (context) => {
        const currentUser = runtime.getCurrentUser();

        let selectedData = [];
        try {
            selectedData = JSON.parse(context.request.parameters.custpage_selected_ids || '[]');
        } catch (e) {
            log.error({ title: 'scheduleMapReduce parse error', details: e.message });
        }

        if (!selectedData.length) {
            renderScheduledModal(context, { scheduled: false, reason: 'no_selection' });
            return;
        }

        // 1. Crear el job record con el payload completo
        let jobId;
        try {
            const jobRec = record.create({ type: JOB_RECORD_TYPE });
            jobRec.setValue({ fieldId: 'custrecord_recep_job_payload',   value: JSON.stringify(selectedData) });
            jobRec.setValue({ fieldId: 'custrecord_recep_job_status',    value: 'pending' });
            jobRec.setValue({ fieldId: 'custrecord_recep_job_userid',    value: currentUser.id });
            jobRec.setValue({ fieldId: 'custrecord_recep_job_useremail', value: currentUser.email });
            jobRec.setValue({ fieldId: 'custrecord_recep_job_username',  value: currentUser.name });
            jobId = jobRec.save();
            log.audit({ title: 'Job record creado', details: 'jobId=' + jobId });
        } catch (e) {
            log.error({ title: 'Error creando job record', details: e.message });
            renderScheduledModal(context, { scheduled: false, reason: 'job_error', error: e.message });
            return;
        }

        // 2. Disparar el Map/Reduce pasando el jobId como parámetro
        let taskId;
        try {
            const mrTask = task.create({
                taskType:     task.TaskType.MAP_REDUCE,
                scriptId:     MR_SCRIPT_ID,
                deploymentId: MR_DEPLOYMENT_ID,
                params: {
                    custscript_recep_mr_job_id: String(jobId)
                }
            });
            taskId = mrTask.submit();
            log.audit({ title: 'MR disparado', details: 'taskId=' + taskId + ' | jobId=' + jobId });
        } catch (e) {
            // Si falla el disparo, marcar el job como error
            log.error({ title: 'Error disparando MR', details: e.message });
            try {
                record.submitFields({
                    type:   JOB_RECORD_TYPE,
                    id:     jobId,
                    values: { custrecord_recep_job_status: 'error' }
                });
            } catch (_) {}
            renderScheduledModal(context, { scheduled: false, reason: 'mr_error', error: e.message });
            return;
        }

        // 3. Mostrar modal de confirmación
        const poCount = [...new Set(selectedData.map(d => d.poId))].length;
        renderScheduledModal(context, {
            scheduled: true,
            poCount,
            itemCount: selectedData.length,
            jobId,
            taskId
        });
    };

    // ══════════════════════════════════════════════════════════════════════════
    // Modal de "Programado correctamente"
    // ══════════════════════════════════════════════════════════════════════════
    const renderScheduledModal = (context, info) => {
        const form = serverWidget.createForm({ title: 'Recepción Masiva de Purchase Orders' });
        form.clientScriptModulePath = '/SuiteScripts/Recepciones Masivas/v2/cs_recepciones_masivas_po.js';
        form.addField({ id: 'custpage_selected_ids', type: serverWidget.FieldType.LONGTEXT, label: 'IDs' })
            .updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });

        const suiteletUrl = url.resolveScript({
            scriptId:     runtime.getCurrentScript().id,
            deploymentId: runtime.getCurrentScript().deploymentId
        });

        let modalContent = '';

        if (!info.scheduled) {
            const msgs = {
                no_selection: 'No se seleccionó ninguna PO para recepcionar.',
                job_error:    'No se pudo crear el registro de trabajo: ' + (info.error || ''),
                mr_error:     'No se pudo programar el proceso en segundo plano: ' + (info.error || '')
            };
            modalContent = `
            <div class="ns-result-section" style="border-color:#ffc107;">
                <div class="ns-result-header" style="background:#fff8e1;color:#e65100;border-bottom:1px solid #ffe082;">
                    ⚠ ${escHtml(msgs[info.reason] || 'Error desconocido.')}
                </div>
            </div>`;
        } else {
            modalContent = `
            <div class="ns-result-section ns-result-ok">
                <div class="ns-result-header ns-result-header-ok">
                    ✓ Proceso programado exitosamente
                </div>
                <div style="padding:14px 16px;font-size:12px;line-height:1.8;">
                    <table style="width:100%;border-collapse:collapse;">
                        <tr>
                            <td style="padding:3px 0;color:#666;width:160px;">POs seleccionadas</td>
                            <td style="font-weight:bold;">${info.poCount}</td>
                        </tr>
                        <tr>
                            <td style="padding:3px 0;color:#666;">Ítems a recepcionar</td>
                            <td style="font-weight:bold;">${info.itemCount}</td>
                        </tr>
                        <tr>
                            <td style="padding:3px 0;color:#666;">ID de tarea</td>
                            <td style="font-family:monospace;color:#0070d9;">${escHtml(String(info.taskId))}</td>
                        </tr>
                        <tr>
                            <td style="padding:3px 0;color:#666;">ID de job</td>
                            <td style="font-family:monospace;color:#0070d9;">${escHtml(String(info.jobId))}</td>
                        </tr>
                    </table>
                    <div style="margin-top:12px;padding:10px;background:#f0f7ff;border:1px solid #b3d4f5;border-radius:2px;color:#1565c0;font-size:11px;">
                        📧 Recibirás un correo cuando el proceso finalice con el detalle de los Item Receipts creados.
                    </div>
                </div>
            </div>`;
        }

        form.addField({ id: 'custpage_modal_result', type: serverWidget.FieldType.INLINEHTML, label: ' ' })
        .defaultValue = `
        <style>
            #ns-overlay{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.45);z-index:9998;}
            #ns-modal{position:fixed;top:50%;left:50%;z-index:9999;transform:translate(-50%,-50%);background:#fff;border:1px solid #acacac;border-top:3px solid #0070d9;border-radius:2px;box-shadow:0 8px 32px rgba(0,0,0,.22);width:560px;max-width:94vw;font-family:Arial,sans-serif;font-size:12px;}
            #ns-modal-title{background:#f4f4f4;border-bottom:1px solid #c8c8c8;padding:10px 16px;font-size:13px;font-weight:bold;color:#333;}
            #ns-modal-body{padding:14px 16px;}
            #ns-modal-footer{padding:10px 16px;border-top:1px solid #c8c8c8;background:#f4f4f4;text-align:right;}
            .ns-result-section{border:1px solid #c8c8c8;border-radius:2px;overflow:hidden;}
            .ns-result-header{padding:8px 12px;font-weight:bold;font-size:12px;}
            .ns-result-header-ok{background:#e8f5e9;color:#2e7d32;border-bottom:1px solid #c8e6c9;}
            .ns-modal-close-btn{display:inline-block;height:22px;line-height:20px;padding:0 14px;background:#0070d9;color:#fff;border:1px solid #0070d9;border-radius:2px;font-size:11px;font-weight:bold;font-family:Arial,sans-serif;cursor:pointer;}
            .ns-modal-close-btn:hover{background:#005cb2;}
        </style>
        <div id="ns-overlay" onclick="closeModal()"></div>
        <div id="ns-modal">
            <div id="ns-modal-title">Resultado — Recepción Masiva de POs</div>
            <div id="ns-modal-body">${modalContent}</div>
            <div id="ns-modal-footer">
                <button class="ns-modal-close-btn" onclick="closeModal()">Volver a la lista</button>
            </div>
        </div>
        <script>
            function closeModal(){
                document.getElementById('ns-overlay').style.display='none';
                document.getElementById('ns-modal').style.display='none';
                window.location.href='${suiteletUrl}';
            }
        <\/script>`;

        form.addSubmitButton({ label: 'Procesar Recepción' });
        context.response.writePage(form);
    };

    // ══════════════════════════════════════════════════════════════════════════
    // getPOsConItems (sin cambios)
    // ══════════════════════════════════════════════════════════════════════════
    const getPOsConItems = (fVendor) => {
        const script = runtime.getCurrentScript();
        const poMap  = {};
        const gov0   = script.getRemainingUsage();

        const headerFilters = [
            ['type',     'anyof', 'PurchOrd'],
            'AND', ['mainline', 'is', 'T'],
            'AND', ['status',   'anyof', 'PurchOrd:B', 'PurchOrd:E']
        ];
        if (fVendor) {
            const vendorIds = [];
            search.create({
                type:    search.Type.VENDOR,
                filters: [['entityid', 'is', fVendor]],
                columns: ['internalid']
            }).run().each(r => { vendorIds.push(r.id); return true; });
            if (vendorIds.length) headerFilters.push('AND', ['entity', 'anyof', vendorIds]);
        }

        search.create({
            type:    search.Type.PURCHASE_ORDER,
            filters: headerFilters,
            columns: [
                search.createColumn({ name: 'tranid'   }),
                search.createColumn({ name: 'entity'   }),
                search.createColumn({ name: 'trandate' }),
                search.createColumn({ name: 'amount'   }),
                search.createColumn({ name: 'memo'     }),
                search.createColumn({ name: 'status'   })
            ]
        }).run().each(r => {
            poMap[r.id] = {
                id:       r.id,
                tranid:   r.getValue('tranid')   || '',
                vendor:   r.getText('entity')    || '',
                trandate: r.getValue('trandate') || '',
                amount:   parseFloat(r.getValue('amount')) || 0,
                memo:     r.getValue('memo')     || '',
                status:   r.getValue('status')   || '',
                items:    []
            };
            return true;
        });

        const gov1 = script.getRemainingUsage();
        log.audit({
            title:   'GOV getPOsConItems — tras search cabeceras POs',
            details: `remaining=${gov1} | consumido=${gov0 - gov1} | POs encontradas=${Object.keys(poMap).length}`
        });

        if (!Object.keys(poMap).length) return [];

        search.create({
            type: search.Type.PURCHASE_ORDER,
            filters: [
                ['internalid', 'anyof', Object.keys(poMap)],
                'AND', ['mainline', 'is',    'F'],
                'AND', ['taxline',  'is',    'F'],
                'AND', ['item',     'isnotempty', ''],
                'AND', ['status',   'anyof', 'PurchOrd:B', 'PurchOrd:E']
            ],
            columns: [
                search.createColumn({ name: 'internalid'       }),
                search.createColumn({ name: 'line'             }),
                search.createColumn({ name: 'item'             }),
                search.createColumn({ name: 'quantity'         }),
                search.createColumn({ name: 'quantityshiprecv' })
            ]
        }).run().each(r => {
            const poId    = r.id;
            const ordered  = parseFloat(r.getValue('quantity'))         || 0;
            const received = parseFloat(r.getValue('quantityshiprecv')) || 0;
            const pending  = Math.floor(ordered - received);
            if (pending > 0 && poMap[poId]) {
                poMap[poId].items.push({
                    lineNum:  r.getValue('line')  || '0',
                    itemId:   r.getValue('item')  || '',
                    itemName: r.getText('item')   || '',
                    ordered:  Math.floor(ordered),
                    received: Math.floor(received),
                    pending
                });
            }
            return true;
        });

        const gov2      = script.getRemainingUsage();
        const resultado = Object.values(poMap).filter(po => po.items.length > 0);
        const totalItems = resultado.reduce((s, p) => s + p.items.length, 0);
        log.audit({
            title:   'GOV getPOsConItems — tras search líneas ítems',
            details: `remaining=${gov2} | consumido=${gov1 - gov2} | POs con ítems=${resultado.length} | ítems totales=${totalItems}`
        });
        log.audit({
            title:   'GOV getPOsConItems — TOTAL función',
            details: `consumido total=${gov0 - gov2} | remaining final=${gov2}`
        });

        return resultado.sort((a, b) => a.vendor !== b.vendor
            ? a.vendor.localeCompare(b.vendor)
            : a.tranid.localeCompare(b.tranid));
    };

    const getGovernanceInfo = () => {
        const remaining = runtime.getCurrentScript().getRemainingUsage();
        return { remaining };
    };

    const fmt     = n => Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const escHtml = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');

    return { onRequest };
});