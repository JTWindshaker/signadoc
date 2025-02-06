const TIPO_CAMPO_TEXT = 1;
const TIPO_CAMPO_SELECT = 2;
const TIPO_CAMPO_QR = 3;
const idTemplate = $('#idTemplate').val();

let pageNumGlobal = 1;

$(document).ready(function () {
    const $pdfContainer = $('#pdf-container');

    // Función para detectar la página visible durante el scroll
    $pdfContainer.on('scroll', function () {
        let currentPage = 1;
        const threshold = $(this).outerHeight() / 2;

        $('.page-container').each(function () {
            const rect = this.getBoundingClientRect();

            if (rect.top < $(window).height() - threshold && rect.bottom >= threshold) {
                currentPage = $(this).data('value');
            }
        });

        if (currentPage) {
            pageNumGlobal = currentPage;
            $('#page-info').html('Página actual: ' + pageNumGlobal);
        }
    });

    $('#saveFields').on('click', function () {
        saveAnnotation();
    });

    loadToolbar();
    loadTemplate(idTemplate);
});

/* Cargar PDF */
const $pdfContainer = $("#pdf-container");
const annotationsData = {};

async function loadPDF(pdfUrl, annotations) {
    const pdfDoc = await pdfjsLib.getDocument(pdfUrl).promise;
    for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
        await renderPage(pdfDoc, pageNum);
    }

    await loadFieldsIntoTemplate(annotations);
}

const SCALE = 0.6;
async function renderPage(pdfDoc, pageNum) {
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: SCALE });

    const $pdfContainer = $("#pdf-container");
    const $pageContainer = $("<div>", {
        class: "page-container",
        id: "page-" + pageNum,
        "data-value": pageNum,
    }).css({
        width: `${viewport.width}px`,
        height: `${viewport.height + 40}px`,
        transform: `scale(${SCALE})`,
        transformOrigin: "center"
    }).appendTo($pdfContainer);

    const $pdfCanvas = $("<canvas>")
        .attr({
            width: viewport.width,
            height: viewport.height,
        }).appendTo($pageContainer);

    const pdfContext = $pdfCanvas[0]?.getContext("2d");
    if (!pdfContext) {
        console.error("No se pudo obtener el contexto del canvas.");
        return;
    }

    const $konvaContainer = $("<div>", { class: "konva-container" })
        .css({
            width: `${viewport.width}px`,
            height: `${viewport.height}px`,
        }).appendTo($pageContainer);

    try {
        await page.render({
            canvasContext: pdfContext,
            viewport: viewport,
        }).promise;

        const canvasWidth = $pdfCanvas[0].width;
        const canvasHeight = $pdfCanvas[0].height;

        const pdfWidth = viewport.width;
        const pdfHeight = viewport.height;

        const scaleX = canvasWidth / pdfWidth;
        const scaleY = canvasHeight / pdfHeight;

        setupKonvaForPage($konvaContainer[0], pageNum, viewport);
    } catch (error) {
        console.error("Error al renderizar la página:", error);
    }
}

/* Configuración Konva */
let konvaStages = {};
let konvaAnnotations = {};
function setupKonvaForPage(container, pageNum, viewport) {
    const stage = new Konva.Stage({
        container: container,
        width: viewport.width,
        height: viewport.height,
    });

    const annotationLayer = new Konva.Layer();
    stage.add(annotationLayer);

    const transformer = new Konva.Transformer({
        padding: 5,
        flipEnabled: false,
        resizeEnabled: false,
        rotateEnabled: false
    });

    annotationLayer.add(transformer);

    if (!annotationsData[pageNum]) {
        annotationsData[pageNum] = [];
    }

    annotationLayer.draw();

    konvaStages[pageNum] = stage;
    konvaAnnotations[pageNum] = annotationLayer;
}

/* Propiedades Anotación */
let nodeGlobal = null;

function unselectAnnotation() {
    if (nodeGlobal) {
        const pageNum = nodeGlobal.attrs.page;
        const stage = konvaStages[pageNum];

        if (stage) {
            stage.fire('click', { target: stage });
        } else {
            console.error(`No se encontró el stage para la página ${pageNum}`);
        }
    }
}

function saveAnnotation() {
    const annotationPromises = [];

    $('.inputFieldAnnotation').each(function () {
        const $input = $(this);
        const typeField = parseInt($input.data('tipo'));
        const fieldId = $input.data('id');
        const pageNum = $input.data('pagina');

        if (annotationsData[pageNum]) {
            const annotationIndex = annotationsData[pageNum].findIndex(annotation => annotation.id === fieldId);

            if (annotationIndex !== -1) {
                const updatedAnnotation = annotationsData[pageNum][annotationIndex];

                switch (typeField) {
                    case TIPO_CAMPO_TEXT: {
                        const value = $input.val();
                        updatedAnnotation.text = value;
                        break;
                    }

                    case TIPO_CAMPO_SELECT: {
                        const value = $input.val();
                        updatedAnnotation.value = value;
                        break;
                    }

                    case TIPO_CAMPO_QR: {
                        const file = $(`#file_${fieldId}`)[0].files[0];
                        if (file) {
                            const imagePromise = new Promise((resolve) => {
                                const reader = new FileReader();

                                reader.onload = function (e) {
                                    const imageObj = new Image();
                                    imageObj.onload = function () {
                                        saveChangeImageAnnotation(pageNum, imageObj, fieldId);
                                        resolve();
                                    };
                                    imageObj.src = e.target.result;
                                };

                                reader.readAsDataURL(file);
                            });

                            annotationPromises.push(imagePromise);
                        } else {
                            saveChangeImageAnnotation(pageNum, null, fieldId);
                        }
                        break;
                    }

                    default:
                        console.warn(`Tipo de campo no manejado: ${typeField} con ID: ${fieldId}`);
                        break;
                }

                console.log(`Anotación con id ${fieldId} actualizada en la página ${pageNum}.`);
            } else {
                console.warn(`No se encontró la anotación con id ${fieldId} en la página ${pageNum}.`);
            }
        } else {
            console.error(`No se encontraron anotaciones para la página ${pageNum}.`);
        }
    });

    Promise.all(annotationPromises).then(() => {
        reloadFields();
        const modal = bootstrap.Modal.getInstance(document.getElementById('modalFillFields'));
        modal.hide();
    });
}

function saveChangeImageAnnotation(pageNum, imageObj, fieldId) {
    if (annotationsData[pageNum]) {
        const annotationIndex = annotationsData[pageNum].findIndex(annotation => annotation.id === fieldId);

        if (annotationIndex !== -1) {
            const updatedAnnotation = annotationsData[pageNum][annotationIndex];

            if (imageObj) {
                updatedAnnotation.image = imageObj;
                updatedAnnotation.src = imageObj.src;
            }

            console.log(`Anotación con id ${fieldId} actualizada en la página ${pageNum}.`);
        } else {
            console.warn(`No se encontró la anotación con id ${fieldId} en la página ${pageNum}.`);
        }
    } else {
        console.error(`No se encontraron anotaciones para la página ${pageNum}.`);
    }
}

function loadToolbar() {
    const pageInfo = $('<p>', {
        id: 'page-info',
        text: 'Página actual: ' + pageNumGlobal,
    }).css({
        "display": "inline",
    });

    $('#toolbar').append(pageInfo);

    // Crear el botón Guardar
    const saveButton = $('<button>', {
        id: 'save-template-btn',
        text: 'Guardar',
        class: 'btn btn-primary',
        click: saveTemplate
    }).css({
        "margin-left": "10px"
    });

    $('#toolbar').append(saveButton);

    // Crear el botón Salir
    const backButton = $('<button>', {
        text: 'Atrás',
        class: 'btn btn-danger',
        click: goBack
    }).css({
        "margin-left": "10px"
    });

    $('#toolbar').append(backButton);

    // Crear el botón Llenar
    const fillButton = $('<button>', {
        text: 'Llenar',
        class: 'btn btn-success',
        click: openModalFillFields
    }).css({
        "margin-left": "10px"
    });

    $('#toolbar').append(fillButton);
}

function goBack() {
    window.history.back();
}

function openModalFillFields() {
    loadFieldsIntoModal();
    const modal = new bootstrap.Modal(document.getElementById('modalFillFields'), {
        // backdrop: false
    });

    modal.show();
}

function saveTemplate() {
    ajaxRequest({
        url: '/fill-template/save-template',
        method: 'POST',
        data: {
            scale: SCALE,
            idTemplate: idTemplate,
            fields: JSON.stringify(annotationsData)
        },
        onSuccess: function (response) {
            console.log('Plantilla guardada exitosamente:', response);
            alert('Plantilla guardada correctamente.');
            // window.location.href = "/template";

            let pdfBase64 = response.data.pdf;
            let pdfBlob = new Blob([Uint8Array.from(atob(pdfBase64), c => c.charCodeAt(0))], { type: 'application/pdf' });

            let downloadLink = document.createElement('a');
            downloadLink.href = URL.createObjectURL(pdfBlob);
            downloadLink.download = 'archivo.pdf';
            document.body.appendChild(downloadLink);
            downloadLink.click();
            document.body.removeChild(downloadLink);
        },
        onError: function (xhr, status, error) {
            console.error('Error al guardar la plantilla:', status, error);
            alert('Ocurrió un error al guardar la plantilla.');
        }
    });
}

function loadTemplate(id) {
    ajaxRequest({
        url: '/fill-template/load-template',
        method: 'POST',
        data: {
            id: id,
        },
        onSuccess: function (response) {
            const objPlantilla = response.data;
            loadPDF(objPlantilla.ruta, objPlantilla.campos);
        },
        onError: function (xhr, status, error) {
            console.error('onError:', status, error);
        }
    });
}

async function loadFieldsIntoTemplate(fields) {
    fields.forEach(field => {
        const properties = field.propiedades;
        const typeField = field.tipo_campo;
        const page = field.pagina;
        const annotationLayer = konvaAnnotations[page];

        // Aquí obtienes el contenedor de la página
        const $pageContainer = $("#page-" + page);
        const canvasWidth = $pageContainer.width() / SCALE;
        const canvasHeight = $pageContainer.height() / SCALE;

        switch (parseInt(typeField)) {
            case TIPO_CAMPO_TEXT: {
                unselectAnnotation();

                const text = new Konva.Text({
                    align: properties.align, // left, center, right
                    draggable: false,
                    fill: properties.fill,
                    fontFamily: properties.fontFamily, // Arial, Times New Roman, Courier New, Verdana, Calibri
                    fontSize: properties.fontSize * SCALE,
                    fontStyle: properties.fontStyle, // normal, italic, bold, 500, italic bold
                    id: properties.id,
                    idField: properties.idField,
                    isEditable: properties.isEditable,
                    lineHeight: properties.lineHeight * SCALE,
                    maxChar: properties.maxChar,
                    name: properties.name,
                    padding: properties.padding,
                    page: page,
                    text: properties.text,
                    textDecoration: properties.textDecoration, // line-through, underline, empty string
                    type: properties.type,
                    verticalAlign: properties.verticalAlign, // top, middle, bottom
                    width: properties.width * SCALE,
                    wrap: properties.wrap, // word, char, none
                    x: properties.x * SCALE,
                    y: properties.y * SCALE,
                });

                annotationLayer.add(text);
                annotationLayer.draw();

                annotationsData[page].push({
                    align: text.align(),
                    draggable: text.draggable(),
                    fill: text.fill(),
                    fontFamily: text.fontFamily(),
                    fontSize: (text.fontSize() / SCALE).toFixed(0) * 1,
                    fontStyle: text.fontStyle(),
                    id: text.id(),
                    idField: text.attrs.idField,
                    isEditable: text.attrs.isEditable,
                    lineHeight: text.lineHeight() / SCALE,
                    maxChar: text.attrs.maxChar,
                    name: text.name(),
                    padding: text.padding(),
                    page: text.attrs.page,
                    text: '',
                    textDecoration: text.textDecoration(),
                    type: text.attrs.type,
                    verticalAlign: text.verticalAlign(),
                    width: text.width() / SCALE,
                    wrap: text.wrap(),
                    x: text.x() / SCALE,
                    y: text.y() / SCALE,
                    canvasWidth: canvasWidth,
                    canvasHeight: canvasHeight,
                });
                break;
            }

            case TIPO_CAMPO_SELECT: {
                unselectAnnotation();

                const select = new Konva.Text({
                    align: properties.align, // left, center, right
                    draggable: false,
                    fill: properties.fill,
                    fontFamily: properties.fontFamily, // Arial, Times New Roman, Courier New, Verdana, Calibri
                    fontSize: properties.fontSize * SCALE,
                    fontStyle: properties.fontStyle, // normal, italic, bold, 500, italic bold
                    id: properties.id,
                    idField: properties.idField,
                    isEditable: properties.isEditable,
                    lineHeight: properties.lineHeight * SCALE,
                    name: properties.name,
                    options: properties.options,
                    padding: properties.padding,
                    page: page,
                    text: properties.text,
                    textDecoration: properties.textDecoration, // line-through, underline, empty string
                    type: properties.type,
                    value: properties.value,
                    verticalAlign: properties.verticalAlign, // top, middle, bottom
                    width: properties.width * SCALE,
                    wrap: properties.wrap, // word, char, none
                    x: properties.x * SCALE,
                    y: properties.y * SCALE,
                });

                annotationLayer.add(select);
                annotationLayer.draw();

                annotationsData[page].push({
                    align: select.align(),
                    draggable: select.draggable(),
                    fill: select.fill(),
                    fontFamily: select.fontFamily(),
                    fontSize: (select.fontSize() / SCALE).toFixed(0) * 1,
                    fontStyle: select.fontStyle(),
                    id: select.id(),
                    idField: select.attrs.idField,
                    isEditable: select.attrs.isEditable,
                    lineHeight: select.lineHeight() / SCALE,
                    name: select.name(),
                    options: select.attrs.options,
                    padding: select.padding(),
                    page: select.attrs.page,
                    text: '',
                    textDecoration: select.textDecoration(),
                    type: select.attrs.type,
                    value: select.attrs.value,
                    verticalAlign: select.verticalAlign(),
                    width: select.width() / SCALE,
                    wrap: select.wrap(),
                    x: select.x() / SCALE,
                    y: select.y() / SCALE,
                    canvasWidth: canvasWidth,
                    canvasHeight: canvasHeight,
                });
                break;
            }

            case TIPO_CAMPO_QR: {
                unselectAnnotation();

                const objImg = new Image();
                objImg.src = properties.src;

                const image = new Konva.Image({
                    draggable: false,
                    height: properties.height * SCALE,
                    id: properties.id,
                    idField: properties.idField,
                    image: objImg,
                    isEditable: properties.isEditable,
                    name: properties.name,
                    opacity: properties.opacity,
                    page: page,
                    rotation: properties.rotation,
                    src: objImg.src,
                    type: properties.type,
                    width: properties.width * SCALE,
                    x: properties.x * SCALE,
                    y: properties.y * SCALE,
                });

                annotationLayer.add(image);
                annotationLayer.draw();

                annotationsData[page].push({
                    draggable: image.draggable(),
                    height: image.height() / SCALE,
                    id: image.id(),
                    idField: image.attrs.idField,
                    image: image.image(),
                    isEditable: image.attrs.isEditable,
                    name: image.name(),
                    opacity: image.opacity(),
                    page: image.attrs.page,
                    rotation: image.rotation(),
                    src: image.attrs.src,
                    type: image.attrs.type,
                    width: image.width() / SCALE,
                    x: image.x() / SCALE,
                    y: image.y() / SCALE,
                    canvasWidth: canvasWidth,
                    canvasHeight: canvasHeight,
                });
                break;
            }
            default:
                break;
        }
    });
}

function loadFieldsIntoModal() {
    const $contFields = $('#contFields');
    $contFields.html("");

    Object.values(annotationsData).forEach((pageFields, pageIndex) => {
        // Agregar un encabezado con el número de la página
        const pageHeaderHTML = `<h1 class="page-header">Página ${pageIndex + 1}</h1>`;
        $contFields.append(pageHeaderHTML);

        // Recorrer los campos de la página actual
        pageFields.forEach(field => {
            if (!field.isEditable) return;

            const typeField = parseInt(field.idField);

            switch (typeField) {
                case TIPO_CAMPO_TEXT: {
                    const textFieldHTML = `
                        <div class="form-group">
                            <label for="${field.id}">${field.name}</label>
                            <input type="text" id="field_${field.id}" name="${field.id}" 
                                class="form-control inputFieldAnnotation" data-tipo="${field.idField}" data-pagina="${field.page}" data-id="${field.id}" placeholder="${field.name}" 
                                value="${field.text}" maxlength="${field.maxChar}">
                        </div>
                    `;
                    $contFields.append(textFieldHTML);
                    break;
                }

                case TIPO_CAMPO_SELECT: {
                    const optionsHTML = field.options.map(option => `
                        <option value="${option.id}" ${option.id == field.value ? 'selected' : ''}>
                            ${option.name}
                        </option>
                    `).join('');

                    const selectFieldHTML = `
                        <div class="form-group">
                            <label for="${field.id}">${field.name}</label>
                            <select id="field_${field.id}" name="${field.id}" class="form-control inputFieldAnnotation" data-tipo="${field.idField}" data-pagina="${field.page}" data-id="${field.id}">
                                ${optionsHTML}
                            </select>
                        </div>
                    `;
                    $contFields.append(selectFieldHTML);
                    break;
                }

                case TIPO_CAMPO_QR: {
                    const qrFieldHTML = `
                        <div class="form-group">
                            <label for="${field.id}">${field.name}</label>
                            <img id="field_${field.id}" name="${field.id}" src="${field.src}" 
                                class="img-fluid inputFieldAnnotation" data-tipo="${field.idField}" data-pagina="${field.page}" data-id="${field.id}" style="width: 150px; height: 150px; display: block; margin-bottom: 10px;">
                            <input type="file" id="file_${field.id}" class="form-control-file" accept="image/*">
                        </div>
                    `;
                    $contFields.append(qrFieldHTML);

                    // Lógica para cambiar imagen y almacenar src en base64
                    $(`#${field.id}-file`).on('change', function (event) {
                        const file = event.target.files[0];

                        if (file) {
                            const reader = new FileReader();
                            reader.onload = function (e) {
                                const newSrc = e.target.result;
                                $(`#${field.id}`).attr('src', newSrc);
                                field.src = newSrc;
                            };
                            reader.readAsDataURL(file);
                        }
                    });
                    break;
                }

                default:
                    console.warn(`Tipo de campo no manejado: ${typeField}`);
                    break;
            }
        });
    });
}

function clearAllAnnotations(stage) {
    stage.getChildren().forEach(layer => {
        if (layer instanceof Konva.Layer) {
            layer.destroyChildren();
            layer.draw();
        }
    });
}

async function reloadFields() {
    Object.values(konvaStages).forEach((stage, pageIndex) => {
        clearAllAnnotations(stage);
    });

    Object.values(annotationsData).forEach((pageFields, pageIndex) => {
        pageFields.forEach(field => {
            const typeField = field.idField;
            const page = field.page;
            const properties = field;
            const annotationLayer = konvaAnnotations[page];

            switch (parseInt(typeField)) {
                case TIPO_CAMPO_TEXT: {
                    const text = new Konva.Text({
                        align: properties.align, // left, center, right
                        draggable: properties.draggable,
                        fill: properties.fill,
                        fontFamily: properties.fontFamily, // Arial, Times New Roman, Courier New, Verdana, Calibri
                        fontSize: properties.fontSize * SCALE,
                        fontStyle: properties.fontStyle, // normal, italic, bold, 500, italic bold
                        id: properties.id,
                        idField: properties.idField,
                        isEditable: properties.isEditable,
                        lineHeight: properties.lineHeight * SCALE,
                        maxChar: properties.maxChar,
                        name: properties.name,
                        padding: properties.padding,
                        page: page,
                        text: properties.text,
                        textDecoration: properties.textDecoration, // line-through, underline, empty string
                        type: properties.type,
                        verticalAlign: properties.verticalAlign, // top, middle, bottom
                        width: properties.width * SCALE,
                        wrap: properties.wrap, // word, char, none
                        x: properties.x * SCALE,
                        y: properties.y * SCALE,
                    });

                    annotationLayer.add(text);
                    annotationLayer.draw();
                    break;
                }

                case TIPO_CAMPO_SELECT: {
                    const select = new Konva.Text({
                        align: properties.align, // left, center, right
                        draggable: false,
                        fill: properties.fill,
                        fontFamily: properties.fontFamily, // Arial, Times New Roman, Courier New, Verdana, Calibri
                        fontSize: properties.fontSize * SCALE,
                        fontStyle: properties.fontStyle, // normal, italic, bold, 500, italic bold
                        id: properties.id,
                        idField: properties.idField,
                        isEditable: properties.isEditable,
                        lineHeight: properties.lineHeight * SCALE,
                        name: properties.name,
                        options: properties.options,
                        padding: properties.padding,
                        page: page,
                        // text: properties.text,
                        text: properties.options.find(option => option.id == properties.value)?.name || "",
                        textDecoration: properties.textDecoration, // line-through, underline, empty string
                        type: properties.type,
                        value: properties.value,
                        verticalAlign: properties.verticalAlign, // top, middle, bottom
                        width: properties.width * SCALE,
                        wrap: properties.wrap, // word, char, none
                        x: properties.x * SCALE,
                        y: properties.y * SCALE,
                    });

                    annotationLayer.add(select);
                    annotationLayer.draw();
                    break;
                }

                case TIPO_CAMPO_QR: {
                    const image = new Konva.Image({
                        draggable: false,
                        height: properties.height * SCALE,
                        id: properties.id,
                        idField: properties.idField,
                        image: properties.image,
                        isEditable: properties.isEditable,
                        name: properties.name,
                        opacity: properties.opacity,
                        page: page,
                        rotation: properties.rotation,
                        src: properties.src,
                        type: properties.type,
                        width: properties.width * SCALE,
                        x: properties.x * SCALE,
                        y: properties.y * SCALE,
                    });

                    annotationLayer.add(image);
                    annotationLayer.draw();
                    break;
                }
                default:
                    break;
            }
        });
    });
}