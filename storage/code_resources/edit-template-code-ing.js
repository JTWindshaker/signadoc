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
            console.log('Página actual visible:', currentPage);
            pageNumGlobal = currentPage;
            $('#page-info').html('Página actual: ' + pageNumGlobal);
        }
    });

    $('#deleteAnnotation').on('click', deleteAnnotation);
    $('#saveProperties').on('click', saveAnnotation);

    $("#zoomIn").on("click", function () {
        SCALE += 0.1;
        SCALE = parseFloat(SCALE.toFixed(1));
        $("#zoomInfo").html(`${Math.round(SCALE * 100)}%`);
        $pdfContainer.html("");
        loadTemplate(idTemplate);
        Object.keys(annotationsData).forEach(key => delete annotationsData[key]);
    });

    $("#zoomOut").on("click", function () {
        SCALE -= 0.1;
        SCALE = parseFloat(SCALE.toFixed(1));
        $("#zoomInfo").html(`${Math.round(SCALE * 100)}%`);
        $pdfContainer.html("");
        loadTemplate(idTemplate);
        Object.keys(annotationsData).forEach(key => delete annotationsData[key]);
    });

    // $("#zoomIn").on("click", function () {
    //     adjustZoom(0);
    // });

    // $("#zoomOut").on("click", function () {
    //     adjustZoom(1);
    // });

    // Eventos del formulario
    $(".styleButton").on("click", function () {
        $(this).toggleClass("active");
    });

    $(".alignButton").on("click", function () {
        $(this).siblings().removeClass("active");
        $(this).addClass("active");
    });

    $('#imageOpacityRange').on('input', function (event) {
        const opacity = parseFloat(event.target.value);
        $('#opacityValue').text(opacity.toFixed(1));
    });

    let optionCount = 1;

    $('#add-option-btn').click(function () {
        const newOption = `
            <div class="option">
                <input type="radio" name="defaultOption" data-value="${optionCount}">
                <input type="text" class="option-input form-control" placeholder="Nueva opción" data-value="${optionCount}">
                <button class="delete-btn">✖</button>
            </div>`;
        $('#options-container').append(newOption);
        optionCount++;
    });

    $('#options-container').on('click', '.delete-btn', function () {
        const optionDiv = $(this).closest('.option');
        optionDiv.remove();

        $('input[name="defaultOption"][data-value="0"]').prop('checked', true);
    });

    $(document).on('change', 'input[type="radio"][name="defaultOption"]', function () {
        console.log('Opción seleccionada:', $(this).next().data('value') || $(this).next().val());
    });

    loadFields();
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

let SCALE = 0.3;
async function renderPage(pdfDoc, pageNum) {
    const page = await pdfDoc.getPage(pageNum);

    const $pdfContainer = $("#pdf-container");
    const viewport = page.getViewport({ scale: SCALE });

    const $pageContainer = $("<div>", {
        class: "page-container",
        id: "page-" + pageNum,
        "data-value": pageNum,
    }).css({
        width: `${viewport.width}px`,
        height: `${viewport.height}px`,
        top: `${((pageNum - 1) * viewport.height)}px`,
    }).appendTo($pdfContainer);

    const $pdfCanvas = $("<canvas>")
        .attr({
            id: "page-" + pageNum,
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

    const MIN_WIDTH = 20;
    const textTransformer = new Konva.Transformer({
        padding: 5,
        flipEnabled: false,
        resizeEnabled: true,
        rotateEnabled: false,
        enabledAnchors: ['middle-left', 'middle-right'],
        boundBoxFunc: (oldBox, newBox) => {
            if (Math.abs(newBox.width) < MIN_WIDTH) {
                return oldBox;
            }
            return newBox;
        },
    });

    const imageTransformer = new Konva.Transformer({
        padding: 5,
        flipEnabled: false,
        resizeEnabled: true,
        rotateEnabled: false,
        keepRatio: true,
        enabledAnchors: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
    });

    annotationLayer.add(textTransformer);
    annotationLayer.add(imageTransformer);

    if (!annotationsData[pageNum]) {
        annotationsData[pageNum] = [];
    }

    annotationLayer.draw();

    stage.on("click tap", (e) => {
        if (e.target === stage) {
            textTransformer.nodes([]);
            imageTransformer.nodes([]);
            annotationLayer.batchDraw();
            hideProperties();
        } else {
            const selectedNode = e.target;
            nodeGlobal = e.target;

            textTransformer.nodes([]);
            imageTransformer.nodes([]);

            if (selectedNode.attrs.type === "text" || selectedNode.attrs.type === "select") {
                textTransformer.nodes([selectedNode]);
            } else if (selectedNode.attrs.type === "image") {
                imageTransformer.nodes([selectedNode]);
            }

            annotationLayer.batchDraw();
            loadAnnotationProperties();
        }
    });

    konvaStages[pageNum] = stage;
    konvaAnnotations[pageNum] = annotationLayer;
}

/* Propiedades Anotación */
let nodeGlobal = null;
function loadAnnotationProperties() {
    const $propertiesContent = $('#propertiesContent');
    const $typeProperties = $('.typeProperties');

    $propertiesContent.removeClass("active");
    $typeProperties.addClass("hidden");

    switch (nodeGlobal.attrs.type) {
        case "text": {
            const $textProperties = $('.textProperties');
            $textProperties.removeClass("hidden");

            let { fontFamily, fontSize, fill, fontStyle, text, isEditable, align, textDecoration } = nodeGlobal.attrs;
            fontSize = (fontSize / SCALE).toFixed(0);

            $("#fontSelect").val(fontFamily);
            $("#fontSizeSelect").val(fontSize);
            $("#fontColor").val(fill);
            $("#placeholder").val(text);

            $("#isEditable").prop("checked", isEditable);

            $("#propItalic").toggleClass("active", fontStyle.includes("italic"));
            $("#propBold").toggleClass("active", fontStyle.includes("bold"));
            $("#propStrikethrough").toggleClass("active", textDecoration.includes("line-through"));
            $("#propUnderline").toggleClass("active", textDecoration.includes("underline"));

            $(".alignButton").removeClass("active");

            switch (align) {
                case "left":
                    $("#propAlignLeft").addClass("active");
                    break;
                case "center":
                    $("#propAlignCenter").addClass("active");
                    break;
                case "right":
                    $("#propAlignRight").addClass("active");
                    break;
                default:
                    console.warn("Alineación no reconocida:", align);
            }

            break;
        }

        case "image": {
            $('#imageFile').val('');

            const $imgProperties = $('.imgProperties');
            $imgProperties.removeClass("hidden");

            const { opacity, isEditable } = nodeGlobal.attrs;

            $('#imageOpacityRange').val(opacity);
            $('#imageOpacityRange').trigger("input");

            $("#isEditable").prop("checked", isEditable);
            break;
        }

        case "select": {
            $('#options-container .option:not(:first)').remove();
            $('input[name="defaultOption"][data-value="0"]').prop('checked', true);

            const $selectProperties = $('.selectProperties');
            $selectProperties.removeClass("hidden");

            let { fontFamily, fontSize, fill, fontStyle, text, isEditable, align, textDecoration, options, value } = nodeGlobal.attrs;
            fontSize = (fontSize / SCALE).toFixed(0);

            $("#fontSelect").val(fontFamily);
            $("#fontSizeSelect").val(fontSize);
            $("#fontColor").val(fill);
            $("#placeholder").val(text);

            $("#isEditable").prop("checked", isEditable);

            $("#propItalic").toggleClass("active", fontStyle.includes("italic"));
            $("#propBold").toggleClass("active", fontStyle.includes("bold"));
            $("#propStrikethrough").toggleClass("active", textDecoration.includes("line-through"));
            $("#propUnderline").toggleClass("active", textDecoration.includes("underline"));

            $(".alignButton").removeClass("active");

            switch (align) {
                case "left":
                    $("#propAlignLeft").addClass("active");
                    break;
                case "center":
                    $("#propAlignCenter").addClass("active");
                    break;
                case "right":
                    $("#propAlignRight").addClass("active");
                    break;
                default:
                    console.warn("Alineación no reconocida:", align);
            }

            options.forEach(option => {
                if (option.id !== 0) {
                    const newOption = $(`
                        <div class="option">
                            <input type="radio" name="defaultOption" data-value="${option.id}">
                            <input type="text" class="option-input form-control" placeholder="Nueva opción" data-value="${option.id}" value="${option.name}">
                            <button class="delete-btn">✖</button>
                        </div>
                    `);

                    if (option.id === value) {
                        newOption.find('input[type="radio"]').prop('checked', true);
                    }

                    $('#options-container').append(newOption);
                } else {
                    $('input.option-input[data-value="0"]').val(option.name);
                }
            });

            break;
        }

        default: {
            console.warn(`Tipo no manejado: ${nodeGlobal.attrs.type}`);
            break;
        }
    }

    $('#propertiesContent').toggleClass('active');
}

function hideProperties() {
    const $propertiesContent = $('#propertiesContent');
    const $typeProperties = $('.typeProperties');

    $propertiesContent.removeClass("active");
    $typeProperties.addClass("hidden");
    cleanAllProperties();
}

function cleanAllProperties() {
    nodeGlobal = null;
    console.log("Todas las propiedades han sido limpiadas.");
}

function setupAnnotationEvents(type, field) {
    const pageNum = field.attrs.page;
    const stage = konvaStages[pageNum];
    const annotationLayer = konvaAnnotations[pageNum];

    switch (type) {
        case "text": {
            const MIN_WIDTH = 20;

            field.on('transform', () => {
                field.setAttrs({
                    width: Math.max(field.width() * field.scaleX(), MIN_WIDTH),
                    scaleX: 1,
                    scaleY: 1,
                });

                updateAnnotationData(pageNum, field, type);
            });
            break;
        }

        case "image": {
            const MIN_SIZE = 45;
            field.on('transform', () => {
                field.setAttrs({
                    width: Math.max(field.width() * field.scaleX(), MIN_SIZE),
                    height: Math.max(field.height() * field.scaleY(), MIN_SIZE),
                    scaleX: 1,
                    scaleY: 1,
                });

                const width = field.width();
                const height = field.height();

                if (width < MIN_SIZE) {
                    field.width(MIN_SIZE);
                }

                if (height < MIN_SIZE) {
                    field.height(MIN_SIZE);
                }

                updateAnnotationData(pageNum, field, type);
            });

            field.on("transformend", () => {
                updateAnnotationData(pageNum, field, type);
                annotationLayer.batchDraw();
            });
            break;
        }

        case "select": {
            const MIN_WIDTH = 100;

            field.on('transform', () => {
                field.setAttrs({
                    width: Math.max(field.width() * field.scaleX(), MIN_WIDTH),
                    scaleX: 1,
                    scaleY: 1,
                });

                updateAnnotationData(pageNum, field, type);
            });
            break;
        }

        default: {
            console.warn(`Tipo no manejado: ${field.attrs.type}`);
            break;
        }
    }

    field.on('dragmove', () => {
        var leftLimit = 0;
        var rightLimit = stage.width();
        var topLimit = 0;
        var bottomLimit = stage.height();

        const pos = field.absolutePosition();

        var newX = Math.max(leftLimit, Math.min(pos.x, rightLimit - (field.width() * field.scaleX())));
        var newY = Math.max(topLimit, Math.min(pos.y, bottomLimit - (field.height() * field.scaleY())));

        field.x(newX);
        field.y(newY);
    });

    field.on("dragend", () => {
        updateAnnotationData(pageNum, field, type);
        annotationLayer.batchDraw();
    });
}

function updateAnnotationData(pageNum, field, type) {
    const idField = field.id();

    switch (type) {
        case "text": {
            annotationsData[pageNum] = annotationsData[pageNum].map(item => {
                if (item.id === idField) {
                    item.x = field.x() / SCALE;
                    item.y = field.y() / SCALE;
                    item.width = field.width() / SCALE;
                    item.height = field.height() / SCALE;
                    return item;
                }
                return item;
            });
            break;
        }

        case "image": {
            annotationsData[pageNum] = annotationsData[pageNum].map(item => {
                if (item.id === idField) {
                    item.x = field.x() / SCALE;
                    item.y = field.y() / SCALE;
                    item.width = field.width() * field.scaleX() / SCALE;
                    item.height = field.height() * field.scaleY() / SCALE;
                    item.rotation = field.rotation();
                    item.opacity = field.opacity();
                    item.image = field.image();
                    return item;
                }
                return item;
            });
            break;
        }

        case "select": {
            annotationsData[pageNum] = annotationsData[pageNum].map(item => {
                if (item.id === idField) {
                    item.x = field.x() / SCALE;
                    item.y = field.y() / SCALE;
                    item.width = field.width() / SCALE;
                    item.height = field.height() / SCALE;
                    return item;
                }
                return item;
            });
            break;
        }

        default: {
            console.warn(`Tipo no manejado: ${field.attrs.type}`);
            break;
        }
    }
}

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
    if (!nodeGlobal) {
        console.warn("No hay ninguna anotación seleccionada para editar.");
        return;
    }

    const pageNum = nodeGlobal.attrs.page;
    const type = nodeGlobal.attrs.type;
    const annotationLayer = konvaAnnotations[pageNum];

    switch (type) {
        case "text": {
            nodeGlobal.fontFamily($("#fontSelect").val());
            nodeGlobal.fontSize(parseInt($("#fontSizeSelect").val(), 10) * SCALE);
            nodeGlobal.fill($("#fontColor").val());

            let fontStyle = [];
            if ($("#propItalic").hasClass("active")) {
                fontStyle.push("italic");
            }

            if ($("#propBold").hasClass("active")) {
                fontStyle.push("bold");
            }

            nodeGlobal.fontStyle(fontStyle.length > 0 ? fontStyle.join(" ") : "normal");

            let textDecoration = [];
            if ($("#propStrikethrough").hasClass("active")) {
                textDecoration.push("line-through");
            }

            if ($("#propUnderline").hasClass("active")) {
                textDecoration.push("underline");
            }

            nodeGlobal.textDecoration(textDecoration.length > 0 ? textDecoration.join(" ") : "empty string");

            nodeGlobal.text($("#placeholder").val());
            nodeGlobal.attrs.isEditable = $("#isEditable").is(":checked");

            if ($("#propAlignLeft").hasClass("active")) {
                nodeGlobal.align("left");
            } else if ($("#propAlignCenter").hasClass("active")) {
                nodeGlobal.align("center");
            } else if ($("#propAlignRight").hasClass("active")) {
                nodeGlobal.align("right");
            }

            if (annotationsData[pageNum]) {
                const annotationIndex = annotationsData[pageNum].findIndex(annotation => annotation.id === nodeGlobal.id());

                if (annotationIndex !== -1) {
                    const updatedAnnotation = annotationsData[pageNum][annotationIndex];

                    updatedAnnotation.fontFamily = $("#fontSelect").val();
                    updatedAnnotation.fontSize = parseInt($("#fontSizeSelect").val(), 10);
                    updatedAnnotation.fill = $("#fontColor").val();
                    updatedAnnotation.fontStyle = fontStyle.length > 0 ? fontStyle.join(" ") : "normal";
                    updatedAnnotation.textDecoration = textDecoration.length > 0 ? textDecoration.join(" ") : "empty string";
                    updatedAnnotation.text = $("#placeholder").val();
                    updatedAnnotation.isEditable = $("#isEditable").is(":checked");
                    updatedAnnotation.align = nodeGlobal.align();

                    console.log(`Anotación con id ${nodeGlobal.id()} actualizada en la página ${pageNum}.`);
                } else {
                    console.warn(`No se encontró la anotación con id ${nodeGlobal.id()} en la página ${pageNum}.`);
                }
            } else {
                console.error(`No se encontraron anotaciones para la página ${pageNum}.`);
            }

            finishSaveAnnotation(annotationLayer);
            break;
        }

        case "image": {
            nodeGlobal.opacity(parseFloat($("#imageOpacityRange").val()));
            nodeGlobal.attrs.isEditable = $("#isEditable").is(":checked");

            const file = $('#imageFile')[0].files[0];
            let imageObj = null;

            if (file) {
                var reader = new FileReader();

                reader.onload = function (e) {
                    imageObj = new Image();
                    imageObj.onload = function () {
                        nodeGlobal.attrs.src = imageObj.src;
                        nodeGlobal.image(imageObj);
                        annotationLayer.batchDraw();
                        saveChangeImageAnnotation(pageNum, annotationLayer, imageObj);
                    };
                    imageObj.src = e.target.result;
                };

                reader.readAsDataURL(file);
            } else {
                imageObj = null;
                saveChangeImageAnnotation(pageNum, annotationLayer, imageObj);
            }
            break;
        }

        case "select": {
            nodeGlobal.fontFamily($("#fontSelect").val());
            nodeGlobal.fontSize(parseInt($("#fontSizeSelect").val(), 10) * SCALE);
            nodeGlobal.fill($("#fontColor").val());

            let fontStyleSelect = [];
            if ($("#propItalic").hasClass("active")) {
                fontStyleSelect.push("italic");
            }

            if ($("#propBold").hasClass("active")) {
                fontStyleSelect.push("bold");
            }

            nodeGlobal.fontStyle(fontStyleSelect.length > 0 ? fontStyleSelect.join(" ") : "normal");

            let textDecorationSelect = [];
            if ($("#propStrikethrough").hasClass("active")) {
                textDecorationSelect.push("line-through");
            }

            if ($("#propUnderline").hasClass("active")) {
                textDecorationSelect.push("underline");
            }

            nodeGlobal.textDecoration(textDecorationSelect.length > 0 ? textDecorationSelect.join(" ") : "empty string");
            nodeGlobal.text($("#placeholder").val());
            nodeGlobal.attrs.isEditable = $("#isEditable").is(":checked");

            if ($("#propAlignLeft").hasClass("active")) {
                nodeGlobal.align("left");
            } else if ($("#propAlignCenter").hasClass("active")) {
                nodeGlobal.align("center");
            } else if ($("#propAlignRight").hasClass("active")) {
                nodeGlobal.align("right");
            }

            const selectedRadio = $('input[name="defaultOption"]:checked');
            const selectedValue = $('input[name="defaultOption"]:checked').data('value');
            const selectedText = selectedRadio.closest('.option').find('.option-input').val();

            nodeGlobal.attrs.value = selectedValue;
            console.log('Opción seleccionada (data-value):', selectedValue);
            console.log('Texto de la opción seleccionada:', selectedText);

            // Obtener todas las opciones como un array
            const optionsArray = [];
            $('#options-container .option').each(function () {
                const dataValue = $(this).find('input[name="defaultOption"]').data('value');
                const inputValue = $(this).find('.option-input').val();
                optionsArray.push({ id: dataValue, name: inputValue });
            });

            console.log('Opciones:', optionsArray);
            nodeGlobal.attrs.options = optionsArray;

            if (annotationsData[pageNum]) {
                const annotationIndex = annotationsData[pageNum].findIndex(annotation => annotation.id === nodeGlobal.id());

                if (annotationIndex !== -1) {
                    const updatedAnnotation = annotationsData[pageNum][annotationIndex];

                    updatedAnnotation.fontFamily = $("#fontSelect").val();
                    updatedAnnotation.fontSize = parseInt($("#fontSizeSelect").val(), 10);
                    updatedAnnotation.fill = $("#fontColor").val();
                    updatedAnnotation.fontStyle = fontStyleSelect.length > 0 ? fontStyleSelect.join(" ") : "normal";
                    updatedAnnotation.textDecoration = textDecorationSelect.length > 0 ? textDecorationSelect.join(" ") : "empty string";
                    updatedAnnotation.text = $("#placeholder").val();
                    updatedAnnotation.isEditable = $("#isEditable").is(":checked");
                    updatedAnnotation.options = optionsArray;
                    updatedAnnotation.value = selectedValue;
                    updatedAnnotation.align = nodeGlobal.align();

                    console.log(`Anotación con id ${nodeGlobal.id()} actualizada en la página ${pageNum}.`);
                } else {
                    console.warn(`No se encontró la anotación con id ${nodeGlobal.id()} en la página ${pageNum}.`);
                }
            } else {
                console.error(`No se encontraron anotaciones para la página ${pageNum}.`);
            }

            finishSaveAnnotation(annotationLayer);
            break;
        }
        default:
            break;
    }
}

function deleteAnnotation() {
    if (!nodeGlobal) {
        console.warn("No hay ninguna anotación seleccionada para editar.");
        return;
    }

    const pageNum = nodeGlobal.attrs.page;
    const annotationId = nodeGlobal.id();

    if (annotationsData[pageNum]) {
        const annotationIndex = annotationsData[pageNum].findIndex(annotation => annotation.id === annotationId);

        if (annotationIndex !== -1) {
            annotationsData[pageNum].splice(annotationIndex, 1);
            console.log(`Anotación con id ${annotationId} eliminada de la página ${pageNum}.`);
        } else {
            console.warn(`No se encontró la anotación con id ${annotationId} en la página ${pageNum}.`);
        }
    } else {
        console.error(`No se encontraron anotaciones para la página ${pageNum}.`);
    }

    nodeGlobal.destroy();
    nodeGlobal = null;

    const stage = konvaStages[pageNum];

    if (stage) {
        stage.fire('click', { target: stage });
    } else {
        console.error(`No se encontró el stage para la página ${pageNum}`);
    }
}

function saveChangeImageAnnotation(pageNum, annotationLayer, imageObj) {
    if (annotationsData[pageNum]) {
        const annotationIndex = annotationsData[pageNum].findIndex(annotation => annotation.id === nodeGlobal.id());

        if (annotationIndex !== -1) {
            const updatedAnnotation = annotationsData[pageNum][annotationIndex];

            updatedAnnotation.opacity = parseFloat($("#imageOpacityRange").val());

            if (imageObj) {
                updatedAnnotation.image = imageObj;
                updatedAnnotation.src = imageObj.src;
            }

            updatedAnnotation.isEditable = $("#isEditable").is(":checked");

            console.log(`Anotación con id ${nodeGlobal.id()} actualizada en la página ${pageNum}.`);
        } else {
            console.warn(`No se encontró la anotación con id ${nodeGlobal.id()} en la página ${pageNum}.`);
        }
    } else {
        console.error(`No se encontraron anotaciones para la página ${pageNum}.`);
    }

    finishSaveAnnotation(annotationLayer);
}

function finishSaveAnnotation(annotationLayer) {
    if (annotationLayer) {
        annotationLayer.batchDraw();
    } else {
        console.error(`No se encontró la anotación para la página ${pageNum}`);
    }

    unselectAnnotation();
}

function loadFields() {
    ajaxRequest({
        url: '/edit-template/list-fields',
        method: 'POST',
        onSuccess: function (response) {
            response.data.forEach(function (campo) {
                const propiedades = campo.propiedades;

                var button = $('<button>', {
                    text: campo.nombre,
                    class: 'btnField',
                    id: 'field-' + campo.tipo_campo + '-' + campo.id,
                    click: function () {
                        const annotationLayer = konvaAnnotations[pageNumGlobal];

                        switch (parseInt(campo.tipo_campo_id)) {
                            case TIPO_CAMPO_TEXT: {
                                unselectAnnotation();

                                const text = new Konva.Text({
                                    align: propiedades.align, // left, center, right
                                    draggable: propiedades.draggable,
                                    fill: propiedades.fill,
                                    fontFamily: propiedades.fontFamily, // Arial, Times New Roman, Courier New, Verdana, Calibri
                                    fontSize: propiedades.fontSize,
                                    fontStyle: propiedades.fontStyle, // normal, italic, bold, 500, italic bold
                                    id: Date.now(),
                                    idField: propiedades.id,
                                    isEditable: propiedades.isEditable,
                                    lineHeight: propiedades.lineHeight,
                                    maxChar: propiedades.maxChar,
                                    name: propiedades.name,
                                    padding: propiedades.padding,
                                    page: pageNumGlobal,
                                    text: propiedades.text,
                                    textDecoration: propiedades.textDecoration, // line-through, underline, empty string
                                    type: propiedades.type,
                                    verticalAlign: propiedades.verticalAlign, // top, middle, bottom
                                    width: propiedades.width,
                                    wrap: propiedades.wrap, // word, char, none
                                    x: propiedades.x,
                                    y: propiedades.y,
                                });

                                annotationLayer.add(text);
                                annotationLayer.draw();

                                annotationsData[pageNumGlobal].push({
                                    align: text.align(),
                                    draggable: text.draggable(),
                                    fill: text.fill(),
                                    fontFamily: text.fontFamily(),
                                    fontSize: text.fontSize(),
                                    fontStyle: text.fontStyle(),
                                    id: text.id(),
                                    idField: text.attrs.idField,
                                    isEditable: text.attrs.isEditable,
                                    lineHeight: text.lineHeight(),
                                    maxChar: text.attrs.maxChar,
                                    name: text.name(),
                                    padding: text.padding(),
                                    page: text.attrs.page,
                                    text: text.text(),
                                    textDecoration: text.textDecoration(),
                                    type: text.attrs.type,
                                    verticalAlign: text.verticalAlign(),
                                    width: text.width(),
                                    wrap: text.wrap(),
                                    x: text.x(),
                                    y: text.y(),
                                });

                                setupAnnotationEvents("text", text);
                                break;
                            }

                            case TIPO_CAMPO_SELECT: {
                                unselectAnnotation();

                                const select = new Konva.Text({
                                    align: propiedades.align, // left, center, right
                                    draggable: propiedades.draggable,
                                    fill: propiedades.fill,
                                    fontFamily: propiedades.fontFamily, // Arial, Times New Roman, Courier New, Verdana, Calibri
                                    fontSize: propiedades.fontSize,
                                    fontStyle: propiedades.fontStyle, // normal, italic, bold, 500, italic bold
                                    id: Date.now(),
                                    idField: propiedades.id,
                                    isEditable: propiedades.isEditable,
                                    lineHeight: propiedades.lineHeight,
                                    name: propiedades.name,
                                    options: propiedades.options,
                                    padding: propiedades.padding,
                                    page: pageNumGlobal,
                                    text: propiedades.text,
                                    textDecoration: propiedades.textDecoration, // line-through, underline, empty string
                                    type: propiedades.type,
                                    value: propiedades.value,
                                    verticalAlign: propiedades.verticalAlign, // top, middle, bottom
                                    width: propiedades.width,
                                    wrap: propiedades.wrap, // word, char, none
                                    x: propiedades.x,
                                    y: propiedades.y,
                                });

                                annotationLayer.add(select);
                                annotationLayer.draw();

                                annotationsData[pageNumGlobal].push({
                                    align: select.align(),
                                    draggable: select.draggable(),
                                    fill: select.fill(),
                                    fontFamily: select.fontFamily(),
                                    fontSize: select.fontSize(),
                                    fontStyle: select.fontStyle(),
                                    id: select.id(),
                                    idField: select.attrs.idField,
                                    isEditable: select.attrs.isEditable,
                                    lineHeight: select.lineHeight(),
                                    name: select.name(),
                                    options: select.attrs.options,
                                    padding: select.padding(),
                                    page: select.attrs.page,
                                    text: select.text(),
                                    textDecoration: select.textDecoration(),
                                    type: select.attrs.type,
                                    value: select.attrs.value,
                                    verticalAlign: select.verticalAlign(),
                                    width: select.width(),
                                    wrap: select.wrap(),
                                    x: select.x(),
                                    y: select.y(),
                                });

                                setupAnnotationEvents("select", select);
                                break;
                            }

                            case TIPO_CAMPO_QR: {
                                unselectAnnotation();

                                const objImg = new Image();
                                objImg.src = propiedades.src;

                                const image = new Konva.Image({
                                    draggable: propiedades.draggable,
                                    height: propiedades.height,
                                    id: Date.now(),
                                    idField: propiedades.id,
                                    image: objImg,
                                    isEditable: propiedades.isEditable,
                                    name: propiedades.name,
                                    opacity: propiedades.opacity,
                                    page: pageNumGlobal,
                                    rotation: propiedades.rotation,
                                    src: objImg.src,
                                    type: propiedades.type,
                                    width: propiedades.width,
                                    x: propiedades.x,
                                    y: propiedades.y,
                                });

                                annotationLayer.add(image);
                                annotationLayer.draw();

                                annotationsData[pageNumGlobal].push({
                                    draggable: image.draggable(),
                                    height: image.height(),
                                    id: image.id(),
                                    idField: image.attrs.idField,
                                    image: image.image(),
                                    isEditable: image.attrs.isEditable,
                                    name: image.name(),
                                    opacity: image.opacity(),
                                    page: image.attrs.page,
                                    rotation: image.rotation(),
                                    src: objImg.src,
                                    type: image.attrs.type,
                                    width: image.width(),
                                    x: image.x(),
                                    y: image.y(),
                                });

                                setupAnnotationEvents("image", image);
                                break;
                            }
                            default:
                                break;
                        }
                    }
                });

                $('#toolbar').append(button);
            });

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
        },
        onError: function (xhr, status, error) {
            console.error('onError:', status, error);
        }
    });
}

function goBack() {
    window.history.back();
}

function saveTemplate() {
    ajaxRequest({
        url: '/edit-template/save-template',
        method: 'POST',
        data: {
            idTemplate: idTemplate,
            fields: JSON.stringify(annotationsData)
        },
        onSuccess: function (response) {
            console.log('Plantilla guardada exitosamente:', response);
            alert('Plantilla guardada correctamente.');
            window.location.href = "/template";
        },
        onError: function (xhr, status, error) {
            console.error('Error al guardar la plantilla:', status, error);
            alert('Ocurrió un error al guardar la plantilla.');
        }
    });
}

function loadTemplate(id) {
    ajaxRequest({
        url: '/edit-template/load-template',
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

        switch (parseInt(typeField)) {
            case TIPO_CAMPO_TEXT: {
                unselectAnnotation();
                
                const text = new Konva.Text({
                    align: properties.align, // left, center, right
                    draggable: properties.draggable,
                    fill: properties.fill,
                    fontFamily: properties.fontFamily, // Arial, Times New Roman, Courier New, Verdana, Calibri
                    fontSize: properties.fontSize * SCALE,
                    fontStyle: properties.fontStyle, // normal, italic, bold, 500, italic bold
                    height: properties.fontSize * SCALE,
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
                    text: text.text(),
                    textDecoration: text.textDecoration(),
                    type: text.attrs.type,
                    verticalAlign: text.verticalAlign(),
                    width: text.width() / SCALE,
                    wrap: text.wrap(),
                    x: text.x() / SCALE,
                    y: text.y() / SCALE,
                });

                setupAnnotationEvents("text", text);
                break;
            }

            case TIPO_CAMPO_SELECT: {
                unselectAnnotation();

                const select = new Konva.Text({
                    align: properties.align, // left, center, right
                    draggable: properties.draggable,
                    fill: properties.fill,
                    fontFamily: properties.fontFamily, // Arial, Times New Roman, Courier New, Verdana, Calibri
                    fontSize: properties.fontSize * SCALE,
                    fontStyle: properties.fontStyle, // normal, italic, bold, 500, italic bold
                    height: properties.fontSize * SCALE,
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
                    text: select.text(),
                    textDecoration: select.textDecoration(),
                    type: select.attrs.type,
                    value: select.attrs.value,
                    verticalAlign: select.verticalAlign(),
                    width: select.width() / SCALE,
                    wrap: select.wrap(),
                    x: select.x() / SCALE,
                    y: select.y() / SCALE,
                });

                setupAnnotationEvents("select", select);
                break;
            }

            case TIPO_CAMPO_QR: {
                unselectAnnotation();

                const objImg = new Image();
                objImg.src = properties.src;

                const image = new Konva.Image({
                    draggable: properties.draggable,
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
                });

                setupAnnotationEvents("image", image);
                break;
            }
            default:
                break;
        }
    });
}

// function adjustZoom(option) {
//     if (option == 0) {
//         SCALE += 0.1; // Zoom In
//     } else {
//         SCALE -= 0.1; // Zoom Out
//     }

//     SCALE = parseFloat(SCALE.toFixed(1));
//     $("#zoomInfo").html(`${Math.round(SCALE * 100)}%`);

//     // Ajusta las posiciones y tamaños de todos los elementos en Konva
//     for (let pageNum in konvaStages) {
//         const stage = konvaStages[pageNum];
//         const annotationLayer = konvaAnnotations[pageNum];

//         annotationLayer.getChildren().forEach(node => {
//             if (node.attrs.type === "text") {
//                 const originalX = node.x();
//                 const originalY = node.y();

//                 // Ajuste del tamaño del texto
//                 node.fontSize(node.fontSize() * SCALE);
//                 node.lineHeight(node.lineHeight() * SCALE);
//                 node.width(node.width() * SCALE);
//                 node.height(node.height() * SCALE);

//                 // Ajuste de la posición X y Y
//                 node.x(originalX * SCALE);  // Ajustamos X proporcionalmente al zoom
//                 node.y(originalY * SCALE);  // Ajustamos Y proporcionalmente al zoom
//             }
//         });

//         annotationLayer.batchDraw();
//     }
// }


// function adjustZoom(option) {
//     if (option == 0) {
//         SCALE += 0.1;
//     } else {
//         SCALE -= 0.1;
//     }

//     SCALE = parseFloat(SCALE.toFixed(1));
//     $("#zoomInfo").html(`${Math.round(SCALE * 100)}%`);

//     // Ajusta las posiciones y tamaños de todos los elementos en Konva
//     for (let pageNum in konvaStages) {
//         const stage = konvaStages[pageNum];
//         const annotationLayer = konvaAnnotations[pageNum];

//         annotationLayer.getChildren().forEach(node => {
//             if (node.attrs.type === "text") {
//                 node.fontSize(node.fontSize() * SCALE); // Ajusta el tamaño de la fuente
//                 node.lineHeight(node.lineHeight() * SCALE); // Ajusta la altura de línea
//                 node.width(node.width() * SCALE); // Ajusta el ancho
//                 node.height(node.height() * SCALE); // Ajusta la altura
//                 node.x(node.x() * SCALE); // Ajusta la posición X
//                 node.y(node.y() * SCALE); // Ajusta la posición Y
//             }
//         });

//         annotationLayer.batchDraw();
//     }
// }