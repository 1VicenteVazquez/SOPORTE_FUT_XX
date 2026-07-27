/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 *
 * sl_carga_nc_masiva.js
 */
define([
    'N/ui/serverWidget',
    'N/file',
    'N/log',
    'N/url',
    'N/runtime',
    'N/task',
    'N/encode'
], (serverWidget, file, log, url, runtime, task, encode) => {

    // Ruta del client Script
    const CLIENT_SCRIPT_PATH = '/SuiteScripts/Credito Factura Proveedor/cs_carga_nc_masiva.js';

    const crearFormulario = () => {
        const form = serverWidget.createForm({
            title: 'Carga Masiva de Notas de Crédito'
        });

        form.clientScriptModulePath = CLIENT_SCRIPT_PATH;

        const html = form.addField({
            id:    'custpage_html',
            type:  serverWidget.FieldType.INLINEHTML,
            label: 'Carga'
        });
        
        html.defaultValue = `
            <div style="background:#e8f4fd;border-left:4px solid #2e7ec1;
                        padding:12px 16px;margin-bottom:12px;border-radius:2px;
                        font-family:Arial,sans-serif;font-size:13px;">
                <b>Instrucciones</b><br>
                • Selecciona uno o varios archivos <b>XML</b> de tipo <b>Nota de Crédito (Egreso)</b>.<br>
                • El sistema procesará cada XML de forma automática basándose en la relación UUID.<br>
                • Los archivos con múltiples UUIDs serán rechazados automáticamente.<br>
            </div>
            <div style="border:2px dashed #ccc;padding:20px;text-align:center;
                        border-radius:4px;font-family:Arial,sans-serif;">
                <input type="file" id="xml_files" multiple accept=".xml"
                       style="font-size:13px;" />
                <p style="font-size:12px;color:#777;margin:8px 0 0;">
                    Puedes seleccionar múltiples archivos a la vez
                </p>
            </div>`;

        const campoData = form.addField({
            id:    'custpage_files_data',
            type:  serverWidget.FieldType.LONGTEXT,
            label: 'Files Data'
        });
        campoData.updateDisplayType({
            displayType: serverWidget.FieldDisplayType.HIDDEN
        });

        form.addSubmitButton({ label: 'Procesar' });
        return form;
    };

    const crearConfirmacion = (totalEnviados, rechazados) => {
        const form = serverWidget.createForm({ title: 'Carga Masiva — Proceso Enviado' });
        const lista = Array.isArray(rechazados) ? rechazados : [];

        const rechazadosHtml = lista.length
            ? '<br><b>Archivos omitidos (' + lista.length + '):</b><ul>' +
              lista.map(r => '<li>' + r.nombre + ': <i>' + r.motivo + '</i></li>').join('') +
              '</ul>'
            : '';

        const fMsg = form.addField({
            id: 'custpage_msg', type: serverWidget.FieldType.INLINEHTML, label: 'Resultado'
        });
        fMsg.defaultValue = `
            <div style="background:#eaf7ea;border-left:4px solid #2e8b57;
                        padding:16px;border-radius:2px;font-family:Arial,sans-serif;font-size:13px;">
                <b style="font-size:15px;">✔ Proceso masivo enviado a cola correctamente</b><br><br>
                • <b>${totalEnviados}</b> archivo(s) XML enviados a procesar.<br>
                • Recibirás un correo con el reporte detallado cuando el proceso termine.
                ${rechazadosHtml}
            </div>
            <br>
            <a href="${url.resolveScript({
                scriptId:          runtime.getCurrentScript().id,
                deploymentId:      runtime.getCurrentScript().deploymentId,
                returnExternalUrl: false
            })}" style="display:inline-block;padding:8px 18px;background:#2e7ec1;
                        color:#fff;border-radius:3px;text-decoration:none;
                        font-family:Arial;font-size:13px;">
                Cargar más archivos
            </a>`;
        return form;
    };

    const onRequest = (ctx) => {
        if (ctx.request.method === 'GET') {
            ctx.response.writePage(crearFormulario());
            return;
        }

        try {
            const scriptObj        = runtime.getCurrentScript();
            
            // PARÁMETROS LIMPIOS
            const folderId         = scriptObj.getParameter({ name: 'custscript_sl_folder_id' });
            const mrScriptId       = scriptObj.getParameter({ name: 'custscript_sl_mr_script_id' });
            const mrDeploymentId   = scriptObj.getParameter({ name: 'custscript_sl_mr_deploy_id' });

            if (!folderId || !mrScriptId || !mrDeploymentId) {
                throw new Error('Faltan parámetros de configuración en el registro de este Suitelet.');
            }

            const data = ctx.request.parameters.custpage_files_data;
            if (!data) throw new Error('No se recibieron datos de archivos.');

            const archivos = JSON.parse(data);
            if (!Array.isArray(archivos) || archivos.length === 0) {
                throw new Error('Lista de archivos vacía o inválida.');
            }

            const items      = [];
            const rechazados = [];
            
            const userEmail  = scriptObj.getCurrentUser ? scriptObj.getCurrentUser().email : runtime.getCurrentUser().email;

            archivos.forEach(a => {
                const nombre = a.nombre || 'sin_nombre';

                if (!nombre.toLowerCase().endsWith('.xml')) {
                    rechazados.push({ nombre, motivo: 'No es archivo XML' });
                    return;
                }

                try {
                    const contenido = encode.convert({
                        string:         a.contenido,
                        inputEncoding:  encode.Encoding.BASE_64,
                        outputEncoding: encode.Encoding.UTF_8
                    });

                    const f = file.create({
                        name:     nombre,
                        fileType: file.Type.XMLDOC,
                        contents: contenido,
                        folder:   parseInt(folderId, 10)
                    });
                    const fileId = f.save();
                    items.push({ fileId, nombreArchivo: nombre, userEmail });

                } catch (eSave) {
                    rechazados.push({ nombre, motivo: 'Error al guardar: ' + eSave.message });
                }
            });

            if (items.length === 0) {
                throw new Error('No se pudo guardar ningún archivo XML válido.');
            }

            const timestamp  = Date.now();
            const loteJson   = JSON.stringify({ items });
            const metaFile   = file.create({
                name:     'meta_nc_masiva_' + timestamp + '.json',
                fileType: file.Type.JSON,
                contents: loteJson,
                folder:   parseInt(folderId, 10)
            });
            const loteFileId = metaFile.save();

            // EJECUCIÓN CON PARÁMETRO LIMPIO
            const taskId = task.create({
                taskType:     task.TaskType.MAP_REDUCE,
                scriptId:     mrScriptId,
                deploymentId: mrDeploymentId,
                params: { 
                    custscript_mr_lote_file_id_masiva: loteFileId 
                } 
            }).submit();

            ctx.response.writePage(crearConfirmacion(items.length, rechazados));

        } catch (e) {
            ctx.response.write('<h3 style="color:red;font-family:Arial;">Error al procesar</h3><p>' + e.message + '</p>');
        }
    };

    return { onRequest };
});