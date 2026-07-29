/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * @NModuleScope SameAccount
 *
 * Script:      mr_recepciones_masivas_po.js
 * Descripcion: Map/Reduce para recepcion masiva de POs en segundo plano.
 *              Complementos: ss_recepciones_masivas_po.js / cs_recepciones_masivas_po.js
 *
 * Custom Record requerido: customrecord_recep_masiva_job
 *   custrecord_recep_job_payload  → Long Text  (JSON de ítems seleccionados)
 *   custrecord_recep_job_status   → Text       (pending | running | done | error)
 *   custrecord_recep_job_userid   → Integer    (internalid del usuario que disparó)
 *   custrecord_recep_job_useremail→ Text       (email del usuario)
 *   custrecord_recep_job_username → Text       (nombre del usuario)
 *   custrecord_recep_job_results  → Long Text  (JSON con resultados al terminar)
 */

define([
    'N/record',
    'N/search',
    'N/email',
    'N/runtime',
    'N/url',
    'N/log'
], (record, search, email, runtime, url, log) => {

    const JOB_RECORD_TYPE = 'customrecord_recep_masiva_job';

    // ══════════════════════════════════════════════════════════════════════════
    // GET INPUT DATA
    // ══════════════════════════════════════════════════════════════════════════
    const getInputData = (context) => {
        const script = runtime.getCurrentScript();
        const jobId  = script.getParameter({ name: 'custscript_recep_mr_job_id' });
        const gov0   = script.getRemainingUsage();

        log.audit({ title: 'GOV getInputData — INICIO', details: 'remaining=' + gov0 + ' | jobId=' + jobId });

        if (!jobId) throw new Error('No se recibio custscript_recep_mr_job_id');

        record.submitFields({
            type:   JOB_RECORD_TYPE,
            id:     jobId,
            values: { custrecord_recep_job_status: 'running' }
        });

        log.audit({
            title:   'GOV getInputData — tras submitFields (job=running)',
            details: 'remaining=' + script.getRemainingUsage() + ' | consumido=' + (gov0 - script.getRemainingUsage())
        });

        const jobRec  = record.load({ type: JOB_RECORD_TYPE, id: jobId });
        const rawJson = jobRec.getValue({ fieldId: 'custrecord_recep_job_payload' });

        log.audit({
            title:   'GOV getInputData — tras record.load (job record)',
            details: 'remaining=' + script.getRemainingUsage() + ' | consumido acum.=' + (gov0 - script.getRemainingUsage())
        });

        let items = [];
        try {
            items = JSON.parse(rawJson || '[]');
        } catch (e) {
            throw new Error('Payload invalido en job record: ' + e.message);
        }

        const byPO = {};
        items.forEach(({ poId, lineNum, itemId, qty }) => {
            if (!byPO[poId]) byPO[poId] = [];
            byPO[poId].push({ lineNum: String(lineNum), itemId: String(itemId), qty: parseInt(qty) });
        });

        const inputArray = Object.entries(byPO).map(([poId, lines]) => ({ poId, lines }));
        const gov1       = script.getRemainingUsage();

        log.audit({
            title:   'GOV getInputData — FIN',
            details: 'remaining=' + gov1 + ' | consumido TOTAL=' + (gov0 - gov1) + ' | POs a procesar=' + inputArray.length
        });

        return inputArray;
    };

    // ══════════════════════════════════════════════════════════════════════════
    // MAP
    // El map es muy liviano; igual medimos para tener el dato.
    // ══════════════════════════════════════════════════════════════════════════
    const map = (context) => {
        const script = runtime.getCurrentScript();
        const gov0   = script.getRemainingUsage();
        const entry  = JSON.parse(context.value);

        context.write({ key: entry.poId, value: JSON.stringify(entry.lines) });

        const gov1 = script.getRemainingUsage();
        log.audit({
            title:   'GOV map — poId=' + entry.poId,
            details: 'remaining=' + gov1 + ' | consumido=' + (gov0 - gov1)
        });
    };

    // ══════════════════════════════════════════════════════════════════════════
    // REDUCE
    // Aqui esta el mayor gasto de gobernanza: transform + save por PO.
    // ══════════════════════════════════════════════════════════════════════════
    const reduce = (context) => {
        const script = runtime.getCurrentScript();
        const poId   = context.key;
        const lines  = JSON.parse(context.values[0]);
        const gov0   = script.getRemainingUsage();

        log.audit({
            title:   'GOV reduce — INICIO poId=' + poId,
            details: 'remaining=' + gov0 + ' | lineas=' + lines.length
        });

        try {
            const govPreReceive = script.getRemainingUsage();
            const irIntId       = receivePO(poId, lines);
            const govPostReceive = script.getRemainingUsage();

            log.audit({
                title:   'GOV reduce — tras receivePO poId=' + poId,
                details: 'remaining=' + govPostReceive + ' | consumido por receivePO=' + (govPreReceive - govPostReceive)
            });

            const irRec    = record.load({ type: record.Type.ITEM_RECEIPT, id: irIntId });
            const irTranid = irRec.getValue({ fieldId: 'tranid' });
            const irUrl    = url.resolveRecord({ recordType: record.Type.ITEM_RECEIPT, recordId: irIntId, isEditMode: false });

            const gov1 = script.getRemainingUsage();
            log.audit({
                title:   'GOV reduce — FIN OK poId=' + poId,
                details: 'remaining=' + gov1 + ' | consumido TOTAL reduce=' + (gov0 - gov1) + ' | IR=' + irTranid
            });

            context.write({ key: poId, value: JSON.stringify({ ok: true, poId, irIntId, irTranid, irUrl }) });

        } catch (e) {
            const gov1 = script.getRemainingUsage();
            log.error({
                title:   'GOV reduce — ERROR poId=' + poId,
                details: 'error=' + e.message + ' | remaining=' + gov1 + ' | consumido=' + (gov0 - gov1)
            });
            context.write({ key: poId, value: JSON.stringify({ ok: false, poId, error: e.message }) });
        }
    };

    // ══════════════════════════════════════════════════════════════════════════
    // SUMMARIZE
    // ══════════════════════════════════════════════════════════════════════════
    const summarize = (context) => {
        const script = runtime.getCurrentScript();
        const jobId  = script.getParameter({ name: 'custscript_recep_mr_job_id' });
        const gov0   = script.getRemainingUsage();

        log.audit({ title: 'GOV summarize — INICIO', details: 'remaining=' + gov0 + ' | jobId=' + jobId });

        // Recopilar resultados
        const results = [];
        context.output.iterator().each((key, value) => {
            results.push(JSON.parse(value));
            return true;
        });

        // Loguear errores internos de las etapas map/reduce si los hubo
        context.mapSummary.errors.iterator().each((key, err) => {
            log.error({ title: 'GOV summarize — map stage error key=' + key, details: err });
            return true;
        });
        context.reduceSummary.errors.iterator().each((key, err) => {
            log.error({ title: 'GOV summarize — reduce stage error key=' + key, details: err });
            return true;
        });

        const ok  = results.filter(r =>  r.ok);
        const err = results.filter(r => !r.ok);

        log.audit({
            title:   'GOV summarize — resultados recopilados',
            details: 'remaining=' + script.getRemainingUsage() + ' | ok=' + ok.length + ' | err=' + err.length
        });

        // Obtener tranids de POs para el email
        const poTranids = {};
        if (results.length > 0) {
            search.create({
                type:    search.Type.PURCHASE_ORDER,
                filters: [['internalid', 'anyof', results.map(r => r.poId)]],
                columns: [search.createColumn({ name: 'tranid' })]
            }).run().each(r => { poTranids[r.id] = r.getValue('tranid'); return true; });
        }
        results.forEach(r => { r.poTranid = poTranids[r.poId] || r.poId; });

        log.audit({
            title:   'GOV summarize — tras search tranids POs',
            details: 'remaining=' + script.getRemainingUsage() + ' | consumido acum.=' + (gov0 - script.getRemainingUsage())
        });

        // Actualizar job record
        if (jobId) {
            try {
                record.submitFields({
                    type:   JOB_RECORD_TYPE,
                    id:     jobId,
                    values: {
                        custrecord_recep_job_status:  err.length === results.length ? 'error' : 'done',
                        custrecord_recep_job_results: JSON.stringify(results)
                    }
                });
                log.audit({
                    title:   'GOV summarize — tras submitFields (job=done)',
                    details: 'remaining=' + script.getRemainingUsage() + ' | consumido acum.=' + (gov0 - script.getRemainingUsage())
                });
            } catch (e) {
                log.error({ title: 'GOV summarize — no se pudo actualizar job record', details: e.message });
            }
        }

        // Enviar email al usuario
        try {
            const jobRec    = record.load({ type: JOB_RECORD_TYPE, id: jobId });
            const userId    = jobRec.getValue({ fieldId: 'custrecord_recep_job_userid'    });
            const userEmail = jobRec.getValue({ fieldId: 'custrecord_recep_job_useremail' });
            const userName  = jobRec.getValue({ fieldId: 'custrecord_recep_job_username'  });
            if (userEmail) sendResultEmail({ userId, userEmail, userName, ok, err, results });
        } catch (e) {
            log.error({ title: 'GOV summarize — error al enviar email', details: e.message });
        }

        const gov1 = script.getRemainingUsage();
        log.audit({
            title:   'GOV summarize — FIN',
            details: 'remaining=' + gov1 + ' | consumido TOTAL summarize=' + (gov0 - gov1)
        });
    };

    // ══════════════════════════════════════════════════════════════════════════
    // receivePO — detalle fino de gobernanza por operacion
    // ══════════════════════════════════════════════════════════════════════════
    const receivePO = (poId, lines) => {
        const script = runtime.getCurrentScript();
        const gov0   = script.getRemainingUsage();

        log.audit({ title: 'GOV receivePO — INICIO poId=' + poId, details: 'remaining=' + gov0 + ' | lines=' + lines.length });

        const rec = record.transform({
            fromType:  record.Type.PURCHASE_ORDER,
            fromId:    Number(poId),
            toType:    record.Type.ITEM_RECEIPT,
            isDynamic: true
        });

        const govPostTransform = script.getRemainingUsage();
        log.audit({
            title:   'GOV receivePO — tras record.transform poId=' + poId,
            details: 'remaining=' + govPostTransform + ' | consumido transform=' + (gov0 - govPostTransform)
        });

        const lineCount    = rec.getLineCount({ sublistId: 'item' });
        const qtyByItemId  = {};
        const qtyByOrdLine = {};

        lines.forEach(l => {
            if (l.itemId)  qtyByItemId[String(l.itemId)]   = parseInt(l.qty);
            if (l.lineNum) qtyByOrdLine[String(l.lineNum)] = parseInt(l.qty);
        });

        for (let i = 0; i < lineCount; i++) {
            rec.selectLine({ sublistId: 'item', line: i });

            const itemId    = String(rec.getCurrentSublistValue({ sublistId: 'item', fieldId: 'item'      }) || '');
            const orderLine = String(rec.getCurrentSublistValue({ sublistId: 'item', fieldId: 'orderline' }) || '');

            let qty = qtyByItemId[itemId];
            if (qty === undefined) qty = qtyByOrdLine[orderLine];

            if (qty !== undefined && qty > 0) {
                rec.setCurrentSublistValue({ sublistId: 'item', fieldId: 'itemreceive', value: true });
                rec.setCurrentSublistValue({ sublistId: 'item', fieldId: 'quantity',    value: qty  });
            } else {
                rec.setCurrentSublistValue({ sublistId: 'item', fieldId: 'itemreceive', value: false });
            }

            rec.commitLine({ sublistId: 'item' });
        }

        const govPreSave = script.getRemainingUsage();
        const savedId    = rec.save();
        const gov1       = script.getRemainingUsage();

        log.audit({
            title:   'GOV receivePO — FIN poId=' + poId,
            details: 'remaining=' + gov1
                   + ' | consumido rec.save=' + (govPreSave - gov1)
                   + ' | consumido TOTAL receivePO=' + (gov0 - gov1)
                   + ' | irId=' + savedId
        });

        return savedId;
    };

    // ══════════════════════════════════════════════════════════════════════════
    // Email de resultados
    // ══════════════════════════════════════════════════════════════════════════
    const sendResultEmail = ({ userId, userEmail, userName, ok, err, results }) => {
        const okLines  = ok.map(r  => '  ok  PO: ' + r.poTranid + '  ->  IR: ' + r.irTranid).join('\n');
        const errLines = err.map(e => '  ERR PO: ' + (e.poTranid || e.poId) + '  ->  ' + e.error).join('\n');

        const body = [
            'Hola ' + userName + ',',
            '',
            'Tu recepcion masiva ha finalizado.',
            '',
            ok.length  ? '-- Completados (' + ok.length + ') --\n' + okLines  : '',
            err.length ? '\n-- Con error (' + err.length + ') --\n' + errLines : '',
            '',
            'Fecha: ' + new Date().toLocaleString('es-MX'),
            '',
            '- NetSuite | Recepciones Masivas'
        ].filter(l => l !== null).join('\n');

        email.send({
            author:     userId,
            recipients: [userEmail],
            subject:    '[NetSuite] Recepcion Masiva -- ' + ok.length + ' PO(s) procesada(s)',
            body
        });
    };

    return { getInputData, map, reduce, summarize };
});