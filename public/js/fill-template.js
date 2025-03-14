// Variables globales
const TIPO_CAMPO_TEXT = 1;
const TIPO_CAMPO_SELECT = 2;
const TIPO_CAMPO_QR = 3;
const TIPO_CAMPO_TEXT_AREA = 4;
const TIPO_CAMPO_DATE = 5;

//Zoom valido
const VALID_ZOOM_MIN = 0.3;
const VALID_ZOOM_MAX = 2;

//Factor para calcular la altura de los input
const FACTOR_HEIGHT_FONT_SIZE = 1.2;
const FACTOR_HEIGHT_FONT_SIZE_TEXT_AREA = 1.2;
const FACTOR_HEIGHT_FONT_SIZE_SELECT = 1.2;

let pdfDoc = null,
    pageNum = 1,
    pageIsRendering = false,
    pageNumIsPending = null,
    scale = 1;
let pdfData = null;
let viewAll = false;
let renderTask = null;

// Elementos del DOM
const container = document.getElementById('pdf-container');
const singleCanvas = document.getElementById('pdf-render');
const pageNumSpan = document.getElementById('page-num');
const pageCountSpan = document.getElementById('page-count');

// Controles
const prevPageBtn = document.getElementById('prev-page');
const nextPageBtn = document.getElementById('next-page');
const zoomInBtn = document.getElementById('zoom-in');
const zoomOutBtn = document.getElementById('zoom-out');
const guardarCamposBtn = document.getElementById('guardar-campos');

// Array para almacenar campos: cada objeto tendrá { container, fieldElement, pdfData, originalPdfData, page, type, properties }
let draggableFields = [];
let activeFieldObj = null;

const idTemplate = $('#idTemplate').val();
$(document).ready(function () {
    loadTemplate(idTemplate);
});

const renderSinglePage = async (num, annotations, isDB = false) => {
    if (!pdfDoc) return;

    pageIsRendering = true;
    pdfDoc.getPage(num).then(async page => {
        const viewport = page.getViewport({ scale });

        singleCanvas.height = viewport.height;
        singleCanvas.width = viewport.width;
        container.style.width = singleCanvas.width + "px";
        container.style.height = singleCanvas.height + "px";

        const renderCtx = {
            canvasContext: singleCanvas.getContext('2d'),
            viewport: viewport
        };

        if (renderTask) {
            renderTask.cancel();
        }

        renderTask = page.render(renderCtx);
        renderTask.promise.then(() => {
            pageIsRendering = false;

            if (pageNumIsPending !== null) {
                renderSinglePage(num = pageNumIsPending, isDB = false);
                pageNumIsPending = null;
            }

            updateDraggableFields();
        }).catch((err) => {
            if (err.name !== "RenderingCancelledException") {
                console.error("Error al renderizar la página:", err);
            }
        });

        pageNumSpan.textContent = num;

        await loadFieldsIntoTemplate(annotations, isDB);
    }).catch(err => {
        console.error("Error al obtener la página:", err);
    });
};

const queueRenderPage = (num, annotations, isDB = false) => {
    if (pageIsRendering) {
        pageNumIsPending = num;
    } else {
        renderSinglePage(num, annotations, isDB);
    }
};

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

// =========================================================
// Carga un PDF y lo renderiza en la vista
// =========================================================
async function loadPDF(pdfUrl, annotations) {
    try {
        const response = await fetch(pdfUrl);
        if (!response.ok) {
            throw new Error(`Error al obtener el PDF: ${response.statusText}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        pdfData = new Uint8Array(arrayBuffer);

        pdfjsLib.getDocument({ data: pdfData }).promise.then(async pdfDoc_ => {
            pdfDoc = pdfDoc_;
            pageCountSpan.textContent = pdfDoc.numPages;
            viewAll = false;

            await renderSinglePage(pageNum, annotations, true);
        }).catch(err => {
            console.error("Error al cargar el PDF:", err);
        });
    } catch (err) {
        console.error("Error al obtener el PDF:", err);
    }
}

const loadFieldsIntoTemplate = async (fields, isDB) => {
    $("#pdf-container div.draggable").remove();
    if (!fields) return;

    if (isDB) {
        draggableFields = [];
        var countIndex = 0;
        fields.forEach(field => {
            countIndex++;
            const properties = field.propiedades;
            const propiedades = properties.properties;
            const typeField = field.tipo_campo;

            switch (parseInt(typeField)) {
                case TIPO_CAMPO_TEXT: {
                    if (!pdfDoc) {
                        alert("Primero carga un PDF.");
                        return;
                    }

                    const inputField = document.createElement("input");
                    const containerDiv = document.createElement("div");

                    const objContainer = properties.container;
                    const defaultWidth = objContainer.width * scale;
                    const defaultHeight = objContainer.height * scale;
                    const initialLeft = objContainer.left * scale;
                    const initialTop = objContainer.top * scale;

                    containerDiv.className = objContainer.className;
                    containerDiv.tabIndex = objContainer.tabIndex;
                    containerDiv.style.width = defaultWidth + "px";
                    containerDiv.style.height = defaultHeight + "px";
                    containerDiv.style.left = initialLeft + "px";
                    containerDiv.style.top = initialTop + "px";
                    containerDiv.dataset.originLeft = initialLeft / scale;
                    containerDiv.dataset.originTop = initialTop / scale;
                    containerDiv.dataset.originWidth = defaultWidth / scale;
                    containerDiv.dataset.originHeight = defaultHeight / scale;

                    inputField.type = "text";
                    inputField.placeholder = propiedades.text;
                    inputField.style.background = "transparent";
                    inputField.style.position = "absolute";
                    inputField.style.width = propiedades.width;
                    inputField.style.height = propiedades.height;
                    inputField.style.border = propiedades.border;
                    inputField.style.outline = propiedades.outline;
                    inputField.style.textAlign = propiedades.textAlign;
                    inputField.style.color = propiedades.color;
                    inputField.style.fontFamily = propiedades.fontFamily;
                    inputField.style.fontSize = (parseFloat(propiedades.fontSize) * scale) + "px";
                    inputField.style.fontStyle = propiedades.fontStyle;
                    inputField.style.fontWeight = propiedades.fontWeight;
                    inputField.style.textDecoration = propiedades.textDecoration;

                    inputField.addEventListener("input", function () {
                        const fieldObj = draggableFields.find(field => field.fieldElement === inputField);

                        if (fieldObj) {
                            fieldObj.properties.text = inputField.value;
                        }
                    });

                    containerDiv.appendChild(inputField);
                    container.appendChild(containerDiv);

                    // Al crear el campo se calcula la posición base en coordenadas PDF y se guarda en originalPdfData
                    properties.pdfData.pdfX = initialLeft / scale;
                    properties.pdfData.pdfFieldWidth = defaultWidth / scale;
                    properties.pdfData.pdfFieldHeight = defaultHeight / scale;
                    properties.pdfData.pdfY = (singleCanvas.height - initialTop - defaultHeight) / scale;

                    const fieldObj = {
                        container: containerDiv,
                        fieldElement: inputField, // Se crea apartir de las propiedades principales en db
                        pdfData: properties.pdfData,
                        originalPdfData: properties.pdfData,
                        page: properties.page,
                        originalPage: properties.page,
                        id: Date.now(),
                        idField: properties.idField,
                        isEditable: properties.isEditable,
                        name: properties.name,
                        type: "text",
                        properties: {
                            text: propiedades.text,
                            width: propiedades.width,
                            height: propiedades.height,
                            border: propiedades.border,
                            outline: propiedades.outline,
                            textAlign: propiedades.textAlign,
                            color: propiedades.color,
                            fontFamily: propiedades.fontFamily,
                            fontSize: propiedades.fontSize,
                            fontStyle: propiedades.fontStyle,
                            fontWeight: propiedades.fontWeight,
                            textDecoration: propiedades.textDecoration,
                        }
                    };

                    draggableFields.push(fieldObj);
                    guardarCamposBtn.style.display = "inline-block";
                    break;
                }

                case TIPO_CAMPO_SELECT: {
                    if (!pdfDoc) {
                        alert("Primero carga un PDF.");
                        return;
                    }

                    const selectField = document.createElement("select");
                    const containerDiv = document.createElement("div");

                    const objContainer = properties.container;
                    const defaultWidth = objContainer.width * scale;
                    const defaultHeight = objContainer.height * scale;
                    const initialLeft = objContainer.left * scale;
                    const initialTop = objContainer.top * scale;

                    containerDiv.className = objContainer.className;
                    containerDiv.tabIndex = objContainer.tabIndex;
                    containerDiv.style.width = defaultWidth + "px";
                    containerDiv.style.height = defaultHeight + "px";
                    containerDiv.style.left = initialLeft + "px";
                    containerDiv.style.top = initialTop + "px";
                    containerDiv.dataset.originLeft = initialLeft / scale;
                    containerDiv.dataset.originTop = initialTop / scale;
                    containerDiv.dataset.originWidth = defaultWidth / scale;
                    containerDiv.dataset.originHeight = defaultHeight / scale;

                    selectField.innerHTML = propiedades.options.map(option => {
                        const selected = option.id.toString() === propiedades.value ? 'selected' : '';
                        return `<option value="${option.id}" ${selected}>${option.name}</option>`;
                    }).join('');

                    selectField.style.background = "transparent";
                    selectField.style.position = "absolute";
                    selectField.style.width = propiedades.width;
                    selectField.style.height = propiedades.height;
                    selectField.style.border = propiedades.border;
                    selectField.style.outline = propiedades.outline;
                    selectField.style.textAlign = propiedades.textAlign;
                    selectField.style.color = propiedades.color;
                    selectField.style.fontFamily = propiedades.fontFamily;
                    selectField.style.fontSize = (parseFloat(propiedades.fontSize) * scale) + "px";
                    selectField.style.fontStyle = propiedades.fontStyle;
                    selectField.style.fontWeight = propiedades.fontWeight;
                    selectField.style.textDecoration = propiedades.textDecoration;
                    selectField.value = propiedades.value;

                    selectField.addEventListener("change", function () {
                        const fieldObj = draggableFields.find(field => field.fieldElement === selectField);

                        if (fieldObj) {
                            fieldObj.properties.value = selectField.value;
                        }
                    });

                    containerDiv.appendChild(selectField);
                    container.appendChild(containerDiv);

                    // Al crear el campo se calcula la posición base en coordenadas PDF y se guarda en originalPdfData
                    properties.pdfData.pdfX = initialLeft / scale;
                    properties.pdfData.pdfFieldWidth = defaultWidth / scale;
                    properties.pdfData.pdfFieldHeight = defaultHeight / scale;
                    properties.pdfData.pdfY = (singleCanvas.height - initialTop - defaultHeight) / scale;

                    const fieldObj = {
                        container: containerDiv,
                        fieldElement: selectField, // Se crea apartir de las propiedades principales en db
                        pdfData: properties.pdfData,
                        originalPdfData: properties.pdfData,
                        page: properties.page,
                        originalPage: properties.page,
                        id: Date.now(),
                        idField: properties.idField,
                        isEditable: properties.isEditable,
                        name: properties.name,
                        type: "dropdown",
                        properties: {
                            text: propiedades.text,
                            width: propiedades.width,
                            height: propiedades.height,
                            border: propiedades.border,
                            outline: propiedades.outline,
                            textAlign: propiedades.textAlign,
                            color: propiedades.color,
                            fontFamily: propiedades.fontFamily,
                            fontSize: propiedades.fontSize,
                            fontStyle: propiedades.fontStyle,
                            fontWeight: propiedades.fontWeight,
                            textDecoration: propiedades.textDecoration,
                            options: propiedades.options,
                            value: propiedades.value,
                        }
                    };

                    draggableFields.push(fieldObj);
                    guardarCamposBtn.style.display = "inline-block";
                    break;
                }

                case TIPO_CAMPO_QR: {
                    if (!pdfDoc) {
                        alert("Primero carga un PDF.");
                        return;
                    }

                    const imgField = document.createElement("img");
                    const containerDiv = document.createElement("div");
                    const objContainer = properties.container;
                    const defaultWidth = objContainer.width * scale;
                    const defaultHeight = objContainer.height * scale;
                    const initialLeft = objContainer.left * scale;
                    const initialTop = objContainer.top * scale;

                    containerDiv.className = objContainer.className;
                    containerDiv.tabIndex = objContainer.tabIndex;
                    containerDiv.style.width = defaultWidth + "px";
                    containerDiv.style.height = defaultHeight + "px";
                    containerDiv.style.left = initialLeft + "px";
                    containerDiv.style.top = initialTop + "px";
                    containerDiv.dataset.originLeft = initialLeft / scale;
                    containerDiv.dataset.originTop = initialTop / scale;
                    containerDiv.dataset.originWidth = defaultWidth / scale;
                    containerDiv.dataset.originHeight = defaultHeight / scale;

                    imgField.style.background = "transparent";
                    imgField.style.position = "absolute";
                    imgField.style.width = propiedades.width;
                    imgField.style.height = propiedades.height;
                    imgField.src = propiedades.src;
                    imgField.alt = "Imagen";
                    imgField.style.objectFit = "contain";
                    imgField.style.opacity = propiedades.opacity;

                    const inputFile = document.createElement("input");
                    inputFile.type = "file";
                    inputFile.accept = "image/*";
                    inputFile.style.display = "none";

                    imgField.addEventListener("click", () => {
                        inputFile.click();
                    });

                    inputFile.addEventListener("change", (event) => {
                        const file = event.target.files[0];
                        if (file) {
                            const reader = new FileReader();
                            reader.onload = (e) => {
                                imgField.src = e.target.result;
                            };
                            reader.readAsDataURL(file);
                        }
                    });

                    containerDiv.appendChild(imgField);
                    containerDiv.appendChild(inputFile);
                    container.appendChild(containerDiv);

                    // Al crear el campo se calcula la posición base en coordenadas PDF y se guarda en originalPdfData
                    properties.pdfData.pdfX = initialLeft / scale;
                    properties.pdfData.pdfFieldWidth = defaultWidth / scale;
                    properties.pdfData.pdfFieldHeight = defaultHeight / scale;
                    properties.pdfData.pdfY = (singleCanvas.height - initialTop - defaultHeight) / scale;

                    const fieldObj = {
                        container: containerDiv,
                        fieldElement: imgField,
                        pdfData: properties.pdfData,
                        originalPdfData: properties.pdfData,
                        page: properties.page,
                        originalPage: properties.page,
                        id: Date.now(),
                        idField: properties.idField,
                        isEditable: properties.isEditable,
                        name: properties.name,
                        type: "image",
                        properties: {
                            opacity: propiedades.opacity,
                            width: propiedades.width,
                            height: propiedades.height,
                            src: propiedades.src,
                        }
                    };

                    draggableFields.push(fieldObj);
                    guardarCamposBtn.style.display = "inline-block";
                    break;
                }

                case TIPO_CAMPO_TEXT_AREA: {
                    if (!pdfDoc) {
                        alert("Primero carga un PDF.");
                        return;
                    }

                    const inputField = document.createElement("textarea");
                    const containerDiv = document.createElement("div");
                    const objContainer = properties.container;
                    const defaultWidth = objContainer.width * scale;
                    const defaultHeight = objContainer.height * scale;
                    const initialLeft = objContainer.left * scale;
                    const initialTop = objContainer.top * scale;

                    containerDiv.className = objContainer.className;
                    containerDiv.tabIndex = objContainer.tabIndex;
                    containerDiv.style.width = defaultWidth + "px";
                    containerDiv.style.height = defaultHeight + "px";
                    containerDiv.style.left = initialLeft + "px";
                    containerDiv.style.top = initialTop + "px";
                    containerDiv.dataset.originLeft = initialLeft / scale;
                    containerDiv.dataset.originTop = initialTop / scale;
                    containerDiv.dataset.originWidth = defaultWidth / scale;
                    containerDiv.dataset.originHeight = defaultHeight / scale;

                    inputField.dataset.type = "textarea";
                    inputField.placeholder = propiedades.text;
                    inputField.style.background = "transparent";
                    inputField.style.position = "absolute";
                    inputField.style.overflow = "hidden";
                    inputField.style.resize = "none";
                    inputField.style.width = propiedades.width;
                    inputField.style.height = propiedades.height;
                    inputField.style.border = propiedades.border;
                    inputField.style.outline = propiedades.outline;
                    inputField.style.textAlign = propiedades.textAlign;
                    inputField.style.color = propiedades.color;
                    inputField.style.fontFamily = propiedades.fontFamily;
                    inputField.style.fontSize = (parseFloat(propiedades.fontSize) * scale) + "px";
                    inputField.style.fontStyle = propiedades.fontStyle;
                    inputField.style.fontWeight = propiedades.fontWeight;
                    inputField.style.textDecoration = propiedades.textDecoration;

                    inputField.addEventListener("input", function () {
                        const fieldObj = draggableFields.find(field => field.fieldElement === inputField);

                        if (fieldObj) {
                            fieldObj.properties.text = inputField.value;
                        }
                    });

                    containerDiv.appendChild(inputField);

                    container.appendChild(containerDiv);

                    // Al crear el campo se calcula la posición base en coordenadas PDF y se guarda en originalPdfData
                    properties.pdfData.pdfX = initialLeft / scale;
                    properties.pdfData.pdfFieldWidth = defaultWidth / scale;
                    properties.pdfData.pdfFieldHeight = defaultHeight / scale;
                    properties.pdfData.pdfY = (singleCanvas.height - initialTop - defaultHeight) / scale;

                    const fieldObj = {
                        container: containerDiv,
                        fieldElement: inputField, // Se crea apartir de las propiedades principales en db
                        pdfData: properties.pdfData,
                        originalPdfData: properties.pdfData,
                        page: properties.page,
                        originalPage: properties.page,
                        id: Date.now(),
                        idField: properties.idField,
                        isEditable: properties.isEditable,
                        name: properties.name,
                        type: "textarea",
                        properties: {
                            text: propiedades.text,
                            width: propiedades.width,
                            height: propiedades.height,
                            border: propiedades.border,
                            outline: propiedades.outline,
                            textAlign: propiedades.textAlign,
                            color: propiedades.color,
                            fontFamily: propiedades.fontFamily,
                            fontSize: propiedades.fontSize,
                            fontStyle: propiedades.fontStyle,
                            fontWeight: propiedades.fontWeight,
                            textDecoration: propiedades.textDecoration,
                        }
                    };

                    draggableFields.push(fieldObj);
                    guardarCamposBtn.style.display = "inline-block";
                    break;
                }

                case TIPO_CAMPO_DATE: {
                    if (!pdfDoc) {
                        alert("Primero carga un PDF.");
                        return;
                    }

                    const inputField = document.createElement("input");
                    const containerDiv = document.createElement("div");

                    const objContainer = properties.container;
                    const defaultWidth = objContainer.width * scale;
                    const defaultHeight = objContainer.height * scale;
                    const initialLeft = objContainer.left * scale;
                    const initialTop = objContainer.top * scale;

                    containerDiv.className = objContainer.className;
                    containerDiv.tabIndex = objContainer.tabIndex;
                    containerDiv.style.width = defaultWidth + "px";
                    containerDiv.style.height = defaultHeight + "px";
                    containerDiv.style.left = initialLeft + "px";
                    containerDiv.style.top = initialTop + "px";
                    containerDiv.dataset.originLeft = initialLeft / scale;
                    containerDiv.dataset.originTop = initialTop / scale;
                    containerDiv.dataset.originWidth = defaultWidth / scale;
                    containerDiv.dataset.originHeight = defaultHeight / scale;

                    inputField.type = "text";
                    inputField.placeholder = propiedades.text;
                    inputField.style.background = "transparent";
                    inputField.style.position = "absolute";
                    inputField.readOnly = true;
                    inputField.style.width = propiedades.width;
                    inputField.style.height = propiedades.height;
                    inputField.style.border = propiedades.border;
                    inputField.style.outline = propiedades.outline;
                    inputField.style.textAlign = propiedades.textAlign;
                    inputField.style.color = propiedades.color;
                    inputField.style.fontFamily = propiedades.fontFamily;
                    inputField.style.fontSize = (parseFloat(propiedades.fontSize) * scale) + "px";
                    inputField.style.fontStyle = propiedades.fontStyle;
                    inputField.style.fontWeight = propiedades.fontWeight;
                    inputField.style.textDecoration = propiedades.textDecoration;
                    inputField.id = "datepicker-" + countIndex + "-" + Date.now();

                    setTimeout(() => {
                        $("#" + inputField.id).datepicker({
                            dateFormat: propiedades.format,
                            minDate: propiedades.minDate ? new Date(propiedades.minDate + "T00:00:00") : null,
                            maxDate: propiedades.maxDate ? new Date(propiedades.maxDate + "T00:00:00") : null,
                            showAnim: "fadeIn",
                            changeMonth: true,
                            changeYear: true,
                            onSelect: function (dateText) {
                                const fieldObj = draggableFields.find(field => field.fieldElement === inputField);

                                if (fieldObj) {
                                    fieldObj.properties.text = dateText;
                                }
                            }
                        });
                    }, 200);

                    containerDiv.appendChild(inputField);
                    container.appendChild(containerDiv);

                    // Al crear el campo se calcula la posición base en coordenadas PDF y se guarda en originalPdfData
                    properties.pdfData.pdfX = initialLeft / scale;
                    properties.pdfData.pdfFieldWidth = defaultWidth / scale;
                    properties.pdfData.pdfFieldHeight = defaultHeight / scale;
                    properties.pdfData.pdfY = (singleCanvas.height - initialTop - defaultHeight) / scale;

                    const fieldObj = {
                        container: containerDiv,
                        fieldElement: inputField, // Se crea apartir de las propiedades principales en db
                        pdfData: properties.pdfData,
                        originalPdfData: properties.pdfData,
                        page: properties.page,
                        originalPage: properties.page,
                        id: Date.now(),
                        idField: properties.idField,
                        isEditable: properties.isEditable,
                        name: properties.name,
                        type: "date",
                        properties: {
                            text: propiedades.text,
                            width: propiedades.width,
                            height: propiedades.height,
                            border: propiedades.border,
                            outline: propiedades.outline,
                            textAlign: propiedades.textAlign,
                            color: propiedades.color,
                            format: propiedades.format,
                            minDate: propiedades.minDate,
                            maxDate: propiedades.maxDate,
                            fontFamily: propiedades.fontFamily,
                            fontSize: propiedades.fontSize,
                            fontStyle: propiedades.fontStyle,
                            fontWeight: propiedades.fontWeight,
                            textDecoration: propiedades.textDecoration,
                        }
                    };

                    draggableFields.push(fieldObj);
                    guardarCamposBtn.style.display = "inline-block";
                    break;
                }

                default:
                    break;
            }
        });
    } else {
        draggableFields = [];
        fields.forEach(field => {
            const propiedades = field.properties;
            const typeField = field.idField;

            switch (parseInt(typeField)) {
                case TIPO_CAMPO_TEXT: {
                    if (!pdfDoc) {
                        alert("Primero carga un PDF.");
                        return;
                    }

                    const inputField = field.fieldElement;
                    inputField.style.fontSize = (parseFloat(propiedades.fontSize) * scale) + "px";

                    const containerDiv = field.container;

                    const defaultWidth = containerDiv.dataset.originWidth * scale;
                    const defaultHeight = containerDiv.dataset.originHeight * scale;
                    const initialLeft = containerDiv.dataset.originLeft * scale;
                    const initialTop = containerDiv.dataset.originTop * scale;

                    containerDiv.style.width = defaultWidth + "px";
                    containerDiv.style.height = defaultHeight + "px";
                    containerDiv.style.left = initialLeft + "px";
                    containerDiv.style.top = initialTop + "px";

                    $(containerDiv).append(inputField);

                    if (pageNum == field.page) {
                        container.appendChild(containerDiv);
                    }

                    // Al crear el campo se calcula la posición base en coordenadas PDF y se guarda en originalPdfData
                    field.pdfData.pdfX = initialLeft / scale;
                    field.pdfData.pdfFieldWidth = defaultWidth / scale;
                    field.pdfData.pdfFieldHeight = defaultHeight / scale;
                    field.pdfData.pdfY = (singleCanvas.height - initialTop - defaultHeight) / scale;

                    const fieldObj = {
                        container: containerDiv,
                        fieldElement: inputField, // Se crea apartir de las propiedades principales en db
                        pdfData: field.pdfData,
                        originalPdfData: field.pdfData,
                        page: field.page,
                        originalPage: field.page,
                        id: Date.now(),
                        idField: field.idField,
                        isEditable: field.isEditable,
                        name: field.name,
                        type: "text",
                        properties: {
                            text: propiedades.text,
                            width: propiedades.width,
                            height: propiedades.height,
                            border: propiedades.border,
                            outline: propiedades.outline,
                            textAlign: propiedades.textAlign,
                            color: propiedades.color,
                            fontFamily: propiedades.fontFamily,
                            fontSize: propiedades.fontSize,
                            fontStyle: propiedades.fontStyle,
                            fontWeight: propiedades.fontWeight,
                            textDecoration: propiedades.textDecoration,
                        }
                    };

                    draggableFields.push(fieldObj);
                    guardarCamposBtn.style.display = "inline-block";
                    break;
                }

                case TIPO_CAMPO_SELECT: {
                    if (!pdfDoc) {
                        alert("Primero carga un PDF.");
                        return;
                    }

                    const selectField = field.fieldElement;
                    selectField.style.fontSize = (parseFloat(propiedades.fontSize) * scale) + "px";

                    const containerDiv = field.container;

                    const defaultWidth = containerDiv.dataset.originWidth * scale;
                    const defaultHeight = containerDiv.dataset.originHeight * scale;
                    const initialLeft = containerDiv.dataset.originLeft * scale;
                    const initialTop = containerDiv.dataset.originTop * scale;

                    containerDiv.style.width = defaultWidth + "px";
                    containerDiv.style.height = defaultHeight + "px";
                    containerDiv.style.left = initialLeft + "px";
                    containerDiv.style.top = initialTop + "px";

                    $(containerDiv).append(selectField);

                    if (pageNum == field.page) {
                        container.appendChild(containerDiv);
                    }

                    // Al crear el campo se calcula la posición base en coordenadas PDF y se guarda en originalPdfData
                    field.pdfData.pdfX = initialLeft / scale;
                    field.pdfData.pdfFieldWidth = defaultWidth / scale;
                    field.pdfData.pdfFieldHeight = defaultHeight / scale;
                    field.pdfData.pdfY = (singleCanvas.height - initialTop - defaultHeight) / scale;

                    const fieldObj = {
                        container: containerDiv,
                        fieldElement: selectField, // Se crea apartir de las propiedades principales en db
                        pdfData: field.pdfData,
                        originalPdfData: field.pdfData,
                        page: field.page,
                        originalPage: field.page,
                        id: Date.now(),
                        idField: field.idField,
                        isEditable: field.isEditable,
                        name: field.name,
                        type: "dropdown",
                        properties: {
                            text: propiedades.text,
                            width: propiedades.width,
                            height: propiedades.height,
                            border: propiedades.border,
                            outline: propiedades.outline,
                            textAlign: propiedades.textAlign,
                            color: propiedades.color,
                            fontFamily: propiedades.fontFamily,
                            fontSize: propiedades.fontSize,
                            fontStyle: propiedades.fontStyle,
                            fontWeight: propiedades.fontWeight,
                            textDecoration: propiedades.textDecoration,
                            options: propiedades.options,
                            value: propiedades.value,
                        }
                    };

                    draggableFields.push(fieldObj);
                    guardarCamposBtn.style.display = "inline-block";
                    break;
                }

                case TIPO_CAMPO_QR: {
                    if (!pdfDoc) {
                        alert("Primero carga un PDF.");
                        return;
                    }

                    const imgField = field.fieldElement;
                    const containerDiv = field.container;

                    const defaultWidth = containerDiv.dataset.originWidth * scale;
                    const defaultHeight = containerDiv.dataset.originHeight * scale;
                    const initialLeft = containerDiv.dataset.originLeft * scale;
                    const initialTop = containerDiv.dataset.originTop * scale;

                    containerDiv.style.width = defaultWidth + "px";
                    containerDiv.style.height = defaultHeight + "px";
                    containerDiv.style.left = initialLeft + "px";
                    containerDiv.style.top = initialTop + "px";

                    $(containerDiv).append(imgField);

                    if (pageNum == field.page) {
                        container.appendChild(containerDiv);
                    }

                    // Al crear el campo se calcula la posición base en coordenadas PDF y se guarda en originalPdfData
                    field.pdfData.pdfX = initialLeft / scale;
                    field.pdfData.pdfFieldWidth = defaultWidth / scale;
                    field.pdfData.pdfFieldHeight = defaultHeight / scale;
                    field.pdfData.pdfY = (singleCanvas.height - initialTop - defaultHeight) / scale;

                    const fieldObj = {
                        container: containerDiv,
                        fieldElement: imgField,
                        pdfData: field.pdfData,
                        originalPdfData: field.pdfData,
                        page: field.page,
                        originalPage: field.page,
                        id: Date.now(),
                        idField: field.idField,
                        isEditable: field.isEditable,
                        name: field.name,
                        type: "image",
                        properties: {
                            opacity: propiedades.opacity,
                            width: propiedades.width,
                            height: propiedades.height,
                            src: propiedades.src,
                        }
                    };

                    draggableFields.push(fieldObj);
                    guardarCamposBtn.style.display = "inline-block";
                    break;
                }

                case TIPO_CAMPO_TEXT_AREA: {
                    if (!pdfDoc) {
                        alert("Primero carga un PDF.");
                        return;
                    }

                    const inputField = field.fieldElement;
                    inputField.style.fontSize = (parseFloat(propiedades.fontSize) * scale) + "px";

                    const containerDiv = field.container;

                    const defaultWidth = containerDiv.dataset.originWidth * scale;
                    const defaultHeight = containerDiv.dataset.originHeight * scale;
                    const initialLeft = containerDiv.dataset.originLeft * scale;
                    const initialTop = containerDiv.dataset.originTop * scale;

                    containerDiv.style.width = defaultWidth + "px";
                    containerDiv.style.height = defaultHeight + "px";
                    containerDiv.style.left = initialLeft + "px";
                    containerDiv.style.top = initialTop + "px";

                    $(containerDiv).append(inputField);

                    if (pageNum == field.page) {
                        container.appendChild(containerDiv);
                    }

                    // Al crear el campo se calcula la posición base en coordenadas PDF y se guarda en originalPdfData
                    field.pdfData.pdfX = initialLeft / scale;
                    field.pdfData.pdfFieldWidth = defaultWidth / scale;
                    field.pdfData.pdfFieldHeight = defaultHeight / scale;
                    field.pdfData.pdfY = (singleCanvas.height - initialTop - defaultHeight) / scale;

                    const fieldObj = {
                        container: containerDiv,
                        fieldElement: inputField, // Se crea apartir de las propiedades principales en db
                        pdfData: field.pdfData,
                        originalPdfData: field.pdfData,
                        page: field.page,
                        originalPage: field.page,
                        id: Date.now(),
                        idField: field.idField,
                        isEditable: field.isEditable,
                        name: field.name,
                        type: "textarea",
                        properties: {
                            text: propiedades.text,
                            width: propiedades.width,
                            height: propiedades.height,
                            border: propiedades.border,
                            outline: propiedades.outline,
                            textAlign: propiedades.textAlign,
                            color: propiedades.color,
                            fontFamily: propiedades.fontFamily,
                            fontSize: propiedades.fontSize,
                            fontStyle: propiedades.fontStyle,
                            fontWeight: propiedades.fontWeight,
                            textDecoration: propiedades.textDecoration,
                        }
                    };

                    draggableFields.push(fieldObj);
                    guardarCamposBtn.style.display = "inline-block";
                    break;
                }

                case TIPO_CAMPO_DATE: {
                    if (!pdfDoc) {
                        alert("Primero carga un PDF.");
                        return;
                    }

                    const inputField = field.fieldElement;
                    inputField.style.fontSize = (parseFloat(propiedades.fontSize) * scale) + "px";

                    const containerDiv = field.container;

                    const defaultWidth = containerDiv.dataset.originWidth * scale;
                    const defaultHeight = containerDiv.dataset.originHeight * scale;
                    const initialLeft = containerDiv.dataset.originLeft * scale;
                    const initialTop = containerDiv.dataset.originTop * scale;

                    containerDiv.style.width = defaultWidth + "px";
                    containerDiv.style.height = defaultHeight + "px";
                    containerDiv.style.left = initialLeft + "px";
                    containerDiv.style.top = initialTop + "px";

                    $(containerDiv).append(inputField);

                    if (pageNum == field.page) {
                        container.appendChild(containerDiv);
                    }

                    // Al crear el campo se calcula la posición base en coordenadas PDF y se guarda en originalPdfData
                    field.pdfData.pdfX = initialLeft / scale;
                    field.pdfData.pdfFieldWidth = defaultWidth / scale;
                    field.pdfData.pdfFieldHeight = defaultHeight / scale;
                    field.pdfData.pdfY = (singleCanvas.height - initialTop - defaultHeight) / scale;

                    const fieldObj = {
                        container: containerDiv,
                        fieldElement: inputField, // Se crea apartir de las propiedades principales en db
                        pdfData: field.pdfData,
                        originalPdfData: field.pdfData,
                        page: field.page,
                        originalPage: field.page,
                        id: Date.now(),
                        idField: field.idField,
                        isEditable: field.isEditable,
                        name: field.name,
                        type: "date",
                        properties: {
                            text: propiedades.text,
                            width: propiedades.width,
                            height: propiedades.height,
                            border: propiedades.border,
                            outline: propiedades.outline,
                            textAlign: propiedades.textAlign,
                            color: propiedades.color,
                            format: propiedades.format,
                            minDate: propiedades.minDate,
                            maxDate: propiedades.maxDate,
                            fontFamily: propiedades.fontFamily,
                            fontSize: propiedades.fontSize,
                            fontStyle: propiedades.fontStyle,
                            fontWeight: propiedades.fontWeight,
                            textDecoration: propiedades.textDecoration,
                        }
                    };

                    draggableFields.push(fieldObj);
                    guardarCamposBtn.style.display = "inline-block";
                    break;
                }

                default:
                    break;
            }
        });
    }
}

prevPageBtn.addEventListener('click', () => {
    if (!pdfDoc || pageNum <= 1) return;
    pageNum--;

    queueRenderPage(pageNum, draggableFields, false);
});

nextPageBtn.addEventListener('click', () => {
    if (!pdfDoc || pageNum >= pdfDoc.numPages) return;
    pageNum++;

    queueRenderPage(pageNum, draggableFields, false);
});

zoomInBtn.addEventListener('click', () => {
    if (!pdfDoc || scale >= VALID_ZOOM_MAX) return;
    scale += 0.1;
    scale = parseFloat(scale.toFixed(1));

    queueRenderPage(pageNum, draggableFields, false);
});

zoomOutBtn.addEventListener('click', () => {
    if (!pdfDoc || scale <= VALID_ZOOM_MIN) return;
    scale -= 0.1;
    scale = parseFloat(scale.toFixed(1));

    queueRenderPage(pageNum, draggableFields, false);
});

//Se actualiza la posición y dimensiones en coordenadas PDF y se guarda en originalPdfData
function updateFieldPDFData(fieldObj) {
    const containerEl = fieldObj.container;
    const newLeft = parseFloat(containerEl.style.left);
    const newTop = parseFloat(containerEl.style.top);
    const fieldWidth = containerEl.offsetWidth;
    const fieldHeight = containerEl.offsetHeight;
    const pdfPageWidth = singleCanvas.width / scale;
    const pdfPageHeight = singleCanvas.height / scale;

    const newPdfData = {
        pdfX: newLeft / scale,
        pdfFieldWidth: fieldWidth / scale,
        pdfFieldHeight: fieldHeight / scale,
        pdfPageWidth: pdfPageWidth,
        pdfPageHeight: pdfPageHeight,
        pdfY: (singleCanvas.height - newTop - fieldHeight) / scale
    };

    fieldObj.pdfData = newPdfData;
    // Actualizamos también el valor "base" que usaremos para posicionar en zoom
    fieldObj.originalPdfData = newPdfData;
}

// Aquí usamos originalPdfData para que el campo no se desplace al hacer zoom
function updateDraggableFields() {
    draggableFields.forEach(fieldObj => {
        if (!viewAll && fieldObj.page === pageNum) {
            fieldObj.container.style.display = "block";
            const pdfPageHeight = singleCanvas.height / scale;
            fieldObj.container.style.left = (fieldObj.originalPdfData.pdfX * scale) + "px";
            fieldObj.container.style.top = ((pdfPageHeight - fieldObj.originalPdfData.pdfY - fieldObj.originalPdfData.pdfFieldHeight) * scale) + "px";
            fieldObj.container.style.width = (fieldObj.originalPdfData.pdfFieldWidth * scale) + "px";
            fieldObj.container.style.height = (fieldObj.originalPdfData.pdfFieldHeight * scale) + "px";

            switch (fieldObj.idField) {
                case TIPO_CAMPO_TEXT:
                case TIPO_CAMPO_SELECT:
                case TIPO_CAMPO_TEXT_AREA:
                case TIPO_CAMPO_DATE:
                    fieldObj.fieldElement.style.fontSize = (fieldObj.properties.fontSize * scale) + "px";
                    break;
                default:
                    break;
            }
        } else {
            fieldObj.container.style.display = "none";
        }
    });
}

guardarCamposBtn.addEventListener('click', async () => {
    if (draggableFields.length === 0) return;

    try {
        const pdfDocLib = await PDFLib.PDFDocument.load(pdfData);
        const pages = pdfDocLib.getPages();

        for (let i = 0; i < draggableFields.length; i++) {
            const fieldObj = draggableFields[i];
            const targetPage = pages[fieldObj.page - 1];
            const { pdfX, pdfY, pdfFieldWidth, pdfFieldHeight } = fieldObj.pdfData;

            switch (fieldObj.idField) {
                case TIPO_CAMPO_TEXT:
                    var font, fontSize = 12, color = PDFLib.rgb(0, 0, 0);

                    if (fieldObj.properties) {
                        const standardFont = getStandardFont(fieldObj.properties);
                        font = await pdfDocLib.embedFont(standardFont);
                        fontSize = fieldObj.properties.fontSize || 12;

                        const colorHex = fieldObj.properties.color || "#000000";
                        const r = parseInt(colorHex.substring(1, 3), 16) / 255;
                        const g = parseInt(colorHex.substring(3, 5), 16) / 255;
                        const b = parseInt(colorHex.substring(5, 7), 16) / 255;
                        color = PDFLib.rgb(r, g, b);
                    } else {
                        font = await pdfDocLib.embedFont(PDFLib.StandardFonts.Helvetica);
                    }

                    targetPage.drawText(fieldObj.fieldElement.value, {
                        x: pdfX,
                        y: pdfY,
                        size: fontSize,
                        font: font,
                        color: color,
                    });
                    break;
                case TIPO_CAMPO_SELECT:
                    var font, fontSize = 12, color = PDFLib.rgb(0, 0, 0);
                    const text = fieldObj.fieldElement.options[fieldObj.fieldElement.selectedIndex].text;

                    if (fieldObj.properties) {
                        const standardFont = getStandardFont(fieldObj.properties);
                        font = await pdfDocLib.embedFont(standardFont);
                        fontSize = fieldObj.properties.fontSize || 12;

                        const colorHex = fieldObj.properties.color || "#000000";
                        const r = parseInt(colorHex.substring(1, 3), 16) / 255;
                        const g = parseInt(colorHex.substring(3, 5), 16) / 255;
                        const b = parseInt(colorHex.substring(5, 7), 16) / 255;
                        color = PDFLib.rgb(r, g, b);
                    } else {
                        font = await pdfDocLib.embedFont(PDFLib.StandardFonts.Helvetica);
                    }

                    targetPage.drawText(text, {
                        x: pdfX,
                        y: pdfY,
                        size: fontSize,
                        font: font,
                        color: color,
                    });
                    break;
                case TIPO_CAMPO_QR:
                    const imageDataUrl = fieldObj.fieldElement.src;

                    if (imageDataUrl && imageDataUrl.startsWith("data:")) {
                        const imageBytes = dataURLtoUint8Array(imageDataUrl);
                        let embeddedImage;

                        if (imageDataUrl.startsWith("data:image/png")) {
                            embeddedImage = await pdfDocLib.embedPng(imageBytes);
                        } else if (imageDataUrl.startsWith("data:image/jpeg") || imageDataUrl.startsWith("data:image/jpg")) {
                            embeddedImage = await pdfDocLib.embedJpg(imageBytes);
                        } else {
                            console.error("Formato de imagen no soportado.");
                            continue;
                        }

                        targetPage.drawImage(embeddedImage, {
                            x: pdfX,
                            y: pdfY,
                            opacity: parseFloat(fieldObj.fieldElement.style.opacity),
                            width: pdfFieldWidth,
                            height: pdfFieldHeight,
                        });
                    } else {
                        console.error("La URL de la imagen no es válida:", imageDataUrl);
                        continue;
                    }
                    break;
                case TIPO_CAMPO_TEXT_AREA:
                    var font, fontSize = 12, color = PDFLib.rgb(0, 0, 0);

                    if (fieldObj.properties) {
                        const standardFont = getStandardFont(fieldObj.properties);
                        font = await pdfDocLib.embedFont(standardFont);
                        fontSize = fieldObj.properties.fontSize || 12;

                        const colorHex = fieldObj.properties.color || "#000000";
                        const r = parseInt(colorHex.substring(1, 3), 16) / 255;
                        const g = parseInt(colorHex.substring(3, 5), 16) / 255;
                        const b = parseInt(colorHex.substring(5, 7), 16) / 255;
                        color = PDFLib.rgb(r, g, b);
                    } else {
                        font = await pdfDocLib.embedFont(PDFLib.StandardFonts.Helvetica);
                    }

                    const topY = (pdfY + pdfFieldHeight) - fontSize;

                    targetPage.drawText(fieldObj.fieldElement.value, {
                        maxWidth: parseFloat(fieldObj.fieldElement.getBoundingClientRect().width),
                        lineHeight: fontSize * FACTOR_HEIGHT_FONT_SIZE_TEXT_AREA,
                        x: pdfX,
                        y: topY,
                        size: fontSize,
                        font: font,
                        color: color,
                    });
                    break;
                case TIPO_CAMPO_DATE:
                    var font, fontSize = 12, color = PDFLib.rgb(0, 0, 0);

                    if (fieldObj.properties) {
                        const standardFont = getStandardFont(fieldObj.properties);
                        font = await pdfDocLib.embedFont(standardFont);
                        fontSize = fieldObj.properties.fontSize || 12;

                        const colorHex = fieldObj.properties.color || "#000000";
                        const r = parseInt(colorHex.substring(1, 3), 16) / 255;
                        const g = parseInt(colorHex.substring(3, 5), 16) / 255;
                        const b = parseInt(colorHex.substring(5, 7), 16) / 255;
                        color = PDFLib.rgb(r, g, b);
                    } else {
                        font = await pdfDocLib.embedFont(PDFLib.StandardFonts.Helvetica);
                    }

                    targetPage.drawText(fieldObj.fieldElement.value, {
                        x: pdfX,
                        y: pdfY,
                        size: fontSize,
                        font: font,
                        color: color,
                    });
                    break;
                default:
                    break;
            }
        }

        const modifiedPdfBytes = await pdfDocLib.save();
        pdfData = modifiedPdfBytes;

        pdfjsLib.getDocument({ data: pdfData }).promise.then(pdfDoc_ => {
            pdfDoc = pdfDoc_;
            pageCountSpan.textContent = pdfDoc.numPages;
            pageNum = Math.min(pageNum, pdfDoc.numPages);
            renderSinglePage(pageNum);
            draggableFields.forEach(fieldObj => {
                if (fieldObj.container.parentNode) {
                    fieldObj.container.parentNode.removeChild(fieldObj.container);
                }
            });

            draggableFields = [];
            guardarCamposBtn.style.display = "none";

            //Descarga
            const blob = new Blob([pdfData], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = "modificado.pdf";
            a.click();
            URL.revokeObjectURL(url);
            //Fin Descarga
        }).catch(err => {
            console.error("Error al recargar el PDF modificado:", err);
        });
    } catch (err) {
        console.error("Error al guardar los campos:", err);
    }
});

function dataURLtoUint8Array(dataURL) {
    const base64 = dataURL.split(',')[1];
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);

    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }

    return bytes;
}

function getStandardFont(props) {
    if (props.fontFamily === "Helvetica") {
        if (props.fontWeight == "bold" && props.fontStyle == "italic") return PDFLib.StandardFonts.HelveticaBoldOblique;
        if (props.fontWeight == "bold") return PDFLib.StandardFonts.HelveticaBold;
        if (props.fontStyle == "italic") return PDFLib.StandardFonts.HelveticaOblique;
        return PDFLib.StandardFonts.Helvetica;
    }
    if (props.fontFamily === "TimesRoman") {
        if (props.fontWeight == "bold" && props.fontStyle == "italic") return PDFLib.StandardFonts.TimesRomanBoldItalic;
        if (props.fontWeight == "bold") return PDFLib.StandardFonts.TimesRomanBold;
        if (props.fontStyle == "italic") return PDFLib.StandardFonts.TimesRomanItalic;
        return PDFLib.StandardFonts.TimesRoman;
    }
    if (props.fontFamily === "Courier") {
        if (props.fontWeight == "bold" && props.fontStyle == "italic") return PDFLib.StandardFonts.CourierBoldOblique;
        if (props.fontWeight == "bold") return PDFLib.StandardFonts.CourierBold;
        if (props.fontStyle == "italic") return PDFLib.StandardFonts.CourierOblique;
        return PDFLib.StandardFonts.Courier;
    }
    return PDFLib.StandardFonts.Helvetica;
}