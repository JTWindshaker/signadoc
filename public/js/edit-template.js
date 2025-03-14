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
const FACTOR_HEIGHT_FONT_SIZE = 1;
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
    // Eventos Propiedades
    $('#apply-properties').on('click', applyProperties);

    $("#image-opacity").on("input", function () {
        $("#image-opacity-value").text($(this).val());
    });

    $(".inputDate").datepicker({
        dateFormat: "yy-mm-dd",
        showAnim: "fadeIn",
        changeMonth: true,
        changeYear: true,
    });

    loadFields();
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

const renderPageLazy = (pageNumber, pageContainer) => {
    pageContainer.innerHTML = "<div class='loading'>Cargando...</div>";
    pdfDoc.getPage(pageNumber).then(page => {
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.style.display = "block";
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        pageContainer.innerHTML = "";
        pageContainer.appendChild(canvas);

        const renderCtx = {
            canvasContext: canvas.getContext("2d"),
            viewport: viewport
        };

        return page.render(renderCtx).promise.then(() => {
            draggableFields.forEach(fieldObj => {
                if (fieldObj.originalPage === pageNumber) {
                    const pdfPageHeight = canvas.height / scale;
                    // Usamos originalPdfData para posicionar el campo sin que se desplace
                    fieldObj.container.style.position = "absolute";
                    fieldObj.container.style.display = "block";
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

                    if (fieldObj.container.parentNode !== pageContainer) {
                        pageContainer.appendChild(fieldObj.container);
                    }
                }
            });
        });
    }).catch(err => {
        console.error("Error al renderizar la página " + pageNumber, err);
        pageContainer.innerHTML = "<div class='error'>Error al cargar la página</div>";
    });
};

const createLazyObserver = () => {
    const options = {
        root: container,
        rootMargin: "200px",
        threshold: 0.1
    };

    return new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const pageNumber = parseInt(entry.target.dataset.pageNumber);

                if (!entry.target.dataset.rendered) {
                    renderPageLazy(pageNumber, entry.target);
                    entry.target.dataset.rendered = "true";
                }
            }
        });
    }, options);
};

const renderAllPages = () => {
    if (!pdfDoc) return;
    container.innerHTML = "";
    const observer = createLazyObserver();

    for (let i = 1; i <= pdfDoc.numPages; i++) {
        const pageContainer = document.createElement("div");
        pageContainer.style.position = "relative";
        pageContainer.style.display = "inline-block";
        pageContainer.style.border = "1px solid #000";
        pageContainer.style.marginBottom = "20px";
        pageContainer.style.minHeight = "100px";
        pageContainer.dataset.pageNumber = i;
        pageContainer.innerHTML = "<div class='loading'>Cargando...</div>";
        container.appendChild(pageContainer);
        observer.observe(pageContainer);
    }
};

document.addEventListener('click', () => {
    draggableFields.forEach(fieldObj => {
        const btnCont = fieldObj.container.querySelector('.field-buttons');

        if (btnCont) {
            btnCont.style.display = "none";
        }
    });
});

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
                        switch (parseInt(campo.tipo_campo_id)) {
                            case TIPO_CAMPO_TEXT: {
                                if (!pdfDoc) {
                                    alert("Primero carga un PDF.");
                                    return;
                                }

                                const inputField = document.createElement("input");
                                const containerDiv = document.createElement("div");
                                const resizeHandle = document.createElement("div");
                                const buttonContainer = document.createElement("div");
                                const buttonSettings = document.createElement("button");
                                const buttonDelete = document.createElement("button");
                                const objContainer = propiedades.container;
                                const defaultWidth = (objContainer.width) * scale;

                                const computedFontSize = propiedades.fontSize * scale;
                                const lineHeight = computedFontSize * FACTOR_HEIGHT_FONT_SIZE;
                                const defaultHeight = lineHeight;

                                const initialLeft = ((singleCanvas.width - defaultWidth) * scale) / 2;
                                const initialTop = ((singleCanvas.height - defaultHeight) * scale) / 2;

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
                                inputField.value = propiedades.text;
                                inputField.style.background = "transparent";
                                inputField.style.position = "absolute";
                                inputField.style.width = propiedades.width;
                                inputField.style.height = propiedades.height;
                                inputField.style.border = propiedades.border;
                                inputField.style.outline = propiedades.outline;
                                inputField.style.textAlign = propiedades.textAlign;
                                inputField.style.color = propiedades.color;
                                inputField.style.fontFamily = propiedades.fontFamily;
                                inputField.style.fontSize = (propiedades.fontSize) * scale + "px";
                                inputField.style.fontStyle = propiedades.fontStyle;
                                inputField.style.fontWeight = propiedades.fontWeight;
                                inputField.style.textDecoration = propiedades.textDecoration;

                                inputField.addEventListener("input", function () {
                                    const fieldObj = draggableFields.find(field => field.fieldElement === inputField);

                                    if (fieldObj) {
                                        fieldObj.properties.text = inputField.value;
                                        fieldObj.name = inputField.value;
                                    }
                                });

                                containerDiv.appendChild(inputField);
                                resizeHandle.className = "resize-handle";
                                containerDiv.appendChild(resizeHandle);

                                buttonContainer.className = "field-buttons";
                                buttonSettings.innerHTML = "⚙️";
                                buttonSettings.title = "Propiedades";
                                buttonDelete.innerHTML = "🗑️";
                                buttonDelete.title = "Eliminar campo";

                                buttonContainer.appendChild(buttonSettings);
                                buttonContainer.appendChild(buttonDelete);
                                containerDiv.appendChild(buttonContainer);

                                container.appendChild(containerDiv);
                                makeDraggable(containerDiv);
                                makeResizableOnlyX(containerDiv, resizeHandle);

                                // Al crear el campo se calcula la posición base en coordenadas PDF y se guarda en originalPdfData
                                propiedades.pdfData.pdfX = initialLeft / scale;
                                propiedades.pdfData.pdfFieldWidth = defaultWidth / scale;
                                propiedades.pdfData.pdfFieldHeight = defaultHeight / scale;
                                propiedades.pdfData.pdfY = (singleCanvas.height - initialTop - defaultHeight) / scale;

                                const fieldObj = {
                                    container: containerDiv,
                                    fieldElement: inputField, // Se crea apartir de las propiedades principales en db
                                    pdfData: propiedades.pdfData,
                                    originalPdfData: propiedades.pdfData,
                                    page: pageNum,
                                    originalPage: pageNum,
                                    id: Date.now(),
                                    idField: propiedades.idField,
                                    isEditable: propiedades.isEditable,
                                    name: propiedades.name,
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

                                containerDiv.addEventListener("click", (e) => {
                                    e.stopPropagation();
                                    hideAllButtonContainersExcept(containerDiv);

                                    const buttonContainer = containerDiv.querySelector('.field-buttons');
                                    if (buttonContainer) {
                                        buttonContainer.style.display = "block";
                                    }

                                    activeFieldObj = fieldObj;
                                });

                                containerDiv.addEventListener("focus", () => {
                                    hideAllButtonContainersExcept(containerDiv);

                                    const buttonContainer = containerDiv.querySelector('.field-buttons');
                                    if (buttonContainer) {
                                        buttonContainer.style.display = "block";
                                    }

                                    activeFieldObj = fieldObj;
                                });

                                containerDiv.addEventListener("blur", () => {
                                    buttonContainer.style.display = "none";
                                });

                                buttonDelete.addEventListener("click", (e) => {
                                    e.stopPropagation();
                                    containerDiv.remove();
                                    draggableFields = draggableFields.filter(item => item.container !== containerDiv);

                                    if (draggableFields.length == 0) {
                                        guardarCamposBtn.style.display = "none";
                                    }
                                });

                                buttonSettings.addEventListener("click", (e) => {
                                    e.stopPropagation();
                                    activeFieldObj = fieldObj;
                                    showPropertiesPanel(fieldObj);
                                });
                                break;
                            }

                            case TIPO_CAMPO_SELECT: {
                                if (!pdfDoc) {
                                    alert("Primero carga un PDF.");
                                    return;
                                }

                                const selectField = document.createElement("select");
                                const containerDiv = document.createElement("div");
                                const resizeHandle = document.createElement("div");
                                const buttonContainer = document.createElement("div");
                                const buttonSettings = document.createElement("button");
                                const buttonDelete = document.createElement("button");
                                const objContainer = propiedades.container;
                                const defaultWidth = (objContainer.width) * scale;

                                const computedFontSize = propiedades.fontSize * scale;
                                const lineHeight = computedFontSize * FACTOR_HEIGHT_FONT_SIZE_SELECT;
                                const defaultHeight = lineHeight;

                                const initialLeft = ((singleCanvas.width - defaultWidth) * scale) / 2;
                                const initialTop = ((singleCanvas.height - defaultHeight) * scale) / 2;

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
                                selectField.style.fontSize = (propiedades.fontSize) * scale + "px";
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
                                resizeHandle.className = "resize-handle";
                                containerDiv.appendChild(resizeHandle);

                                buttonContainer.className = "field-buttons";
                                buttonSettings.innerHTML = "⚙️";
                                buttonSettings.title = "Propiedades";
                                buttonDelete.innerHTML = "🗑️";
                                buttonDelete.title = "Eliminar campo";

                                buttonContainer.appendChild(buttonSettings);
                                buttonContainer.appendChild(buttonDelete);
                                containerDiv.appendChild(buttonContainer);

                                container.appendChild(containerDiv);
                                makeDraggable(containerDiv);
                                makeResizableOnlyX(containerDiv, resizeHandle);

                                // Al crear el campo se calcula la posición base en coordenadas PDF y se guarda en originalPdfData
                                propiedades.pdfData.pdfX = initialLeft / scale;
                                propiedades.pdfData.pdfFieldWidth = defaultWidth / scale;
                                propiedades.pdfData.pdfFieldHeight = defaultHeight / scale;
                                propiedades.pdfData.pdfY = (singleCanvas.height - initialTop - defaultHeight) / scale;

                                const fieldObj = {
                                    container: containerDiv,
                                    fieldElement: selectField, // Se crea apartir de las propiedades principales en db
                                    pdfData: propiedades.pdfData,
                                    originalPdfData: propiedades.pdfData,
                                    page: pageNum,
                                    originalPage: pageNum,
                                    id: Date.now(),
                                    idField: propiedades.idField,
                                    isEditable: propiedades.isEditable,
                                    name: propiedades.name,
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

                                containerDiv.addEventListener("click", (e) => {
                                    e.stopPropagation();
                                    hideAllButtonContainersExcept(containerDiv);

                                    const buttonContainer = containerDiv.querySelector('.field-buttons');
                                    if (buttonContainer) {
                                        buttonContainer.style.display = "block";
                                    }

                                    activeFieldObj = fieldObj;
                                });

                                containerDiv.addEventListener("focus", () => {
                                    hideAllButtonContainersExcept(containerDiv);

                                    const buttonContainer = containerDiv.querySelector('.field-buttons');
                                    if (buttonContainer) {
                                        buttonContainer.style.display = "block";
                                    }

                                    activeFieldObj = fieldObj;
                                });

                                containerDiv.addEventListener("blur", () => {
                                    buttonContainer.style.display = "none";
                                });

                                buttonDelete.addEventListener("click", (e) => {
                                    e.stopPropagation();
                                    containerDiv.remove();
                                    draggableFields = draggableFields.filter(item => item.container !== containerDiv);

                                    if (draggableFields.length == 0) {
                                        guardarCamposBtn.style.display = "none";
                                    }
                                });

                                buttonSettings.addEventListener("click", (e) => {
                                    e.stopPropagation();
                                    activeFieldObj = fieldObj;
                                    showPropertiesPanel(fieldObj);
                                });
                                break;
                            }

                            case TIPO_CAMPO_QR: {
                                if (!pdfDoc) {
                                    alert("Primero carga un PDF.");
                                    return;
                                }

                                const imgField = document.createElement("img");
                                const containerDiv = document.createElement("div");
                                const resizeHandle = document.createElement("div");
                                const buttonContainer = document.createElement("div");
                                const buttonSettings = document.createElement("button");
                                const buttonDelete = document.createElement("button");
                                const objContainer = propiedades.container;
                                const defaultWidth = (objContainer.width) * scale;
                                const defaultHeight = (objContainer.height) * scale;
                                const initialLeft = ((singleCanvas.width - defaultWidth) * scale) / 2;
                                const initialTop = ((singleCanvas.height - defaultHeight) * scale) / 2;

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

                                containerDiv.appendChild(imgField);
                                resizeHandle.className = "resize-handle";
                                containerDiv.appendChild(resizeHandle);

                                buttonContainer.className = "field-buttons";
                                buttonSettings.innerHTML = "⚙️";
                                buttonSettings.title = "Propiedades";
                                buttonDelete.innerHTML = "🗑️";
                                buttonDelete.title = "Eliminar campo";

                                buttonContainer.appendChild(buttonSettings);
                                buttonContainer.appendChild(buttonDelete);
                                containerDiv.appendChild(buttonContainer);

                                container.appendChild(containerDiv);
                                makeDraggable(containerDiv);
                                makeResizable(containerDiv, resizeHandle);

                                // Al crear el campo se calcula la posición base en coordenadas PDF y se guarda en originalPdfData
                                propiedades.pdfData.pdfX = initialLeft / scale;
                                propiedades.pdfData.pdfFieldWidth = defaultWidth / scale;
                                propiedades.pdfData.pdfFieldHeight = defaultHeight / scale;
                                propiedades.pdfData.pdfY = (singleCanvas.height - initialTop - defaultHeight) / scale;

                                const fieldObj = {
                                    container: containerDiv,
                                    fieldElement: imgField,
                                    pdfData: propiedades.pdfData,
                                    originalPdfData: propiedades.pdfData,
                                    page: pageNum,
                                    originalPage: pageNum,
                                    id: Date.now(),
                                    idField: propiedades.idField,
                                    isEditable: propiedades.isEditable,
                                    name: propiedades.name,
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

                                containerDiv.addEventListener("click", (e) => {
                                    e.stopPropagation();
                                    hideAllButtonContainersExcept(containerDiv);

                                    const buttonContainer = containerDiv.querySelector('.field-buttons');
                                    if (buttonContainer) {
                                        buttonContainer.style.display = "block";
                                    }

                                    activeFieldObj = fieldObj;
                                });

                                containerDiv.addEventListener("focus", () => {
                                    hideAllButtonContainersExcept(containerDiv);

                                    const buttonContainer = containerDiv.querySelector('.field-buttons');
                                    if (buttonContainer) {
                                        buttonContainer.style.display = "block";
                                    }

                                    activeFieldObj = fieldObj;
                                });

                                containerDiv.addEventListener("blur", () => {
                                    buttonContainer.style.display = "none";
                                });

                                buttonDelete.addEventListener("click", (e) => {
                                    e.stopPropagation();
                                    containerDiv.remove();
                                    draggableFields = draggableFields.filter(item => item.container !== containerDiv);

                                    if (draggableFields.length == 0) {
                                        guardarCamposBtn.style.display = "none";
                                    }
                                });

                                buttonSettings.addEventListener("click", (e) => {
                                    e.stopPropagation();
                                    activeFieldObj = fieldObj;
                                    showPropertiesPanel(fieldObj);
                                });
                                break;
                            }

                            case TIPO_CAMPO_TEXT_AREA: {
                                if (!pdfDoc) {
                                    alert("Primero carga un PDF.");
                                    return;
                                }

                                const inputField = document.createElement("textarea");
                                const containerDiv = document.createElement("div");
                                const resizeHandle = document.createElement("div");
                                const buttonContainer = document.createElement("div");
                                const buttonSettings = document.createElement("button");
                                const buttonDelete = document.createElement("button");
                                const objContainer = propiedades.container;
                                const defaultWidth = (objContainer.width) * scale;
                                const defaultHeight = (objContainer.height) * scale;
                                const initialLeft = ((singleCanvas.width - defaultWidth) * scale) / 2;
                                const initialTop = ((singleCanvas.height - defaultHeight) * scale) / 2;

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
                                inputField.value = propiedades.text;
                                inputField.style.background = "transparent";
                                inputField.style.position = "absolute";
                                inputField.style.overflow = "hidden";
                                inputField.style.width = propiedades.width;
                                inputField.style.height = propiedades.height;
                                inputField.style.border = propiedades.border;
                                inputField.style.outline = propiedades.outline;
                                inputField.style.textAlign = propiedades.textAlign;
                                inputField.style.color = propiedades.color;
                                inputField.style.fontFamily = propiedades.fontFamily;
                                inputField.style.fontSize = (propiedades.fontSize) * scale + "px";
                                inputField.style.fontStyle = propiedades.fontStyle;
                                inputField.style.fontWeight = propiedades.fontWeight;
                                inputField.style.textDecoration = propiedades.textDecoration;

                                inputField.addEventListener("input", function () {
                                    const fieldObj = draggableFields.find(field => field.fieldElement === inputField);

                                    if (fieldObj) {
                                        fieldObj.properties.text = inputField.value;
                                        fieldObj.name = inputField.value;
                                    }
                                });

                                containerDiv.appendChild(inputField);
                                resizeHandle.className = "resize-handle";
                                containerDiv.appendChild(resizeHandle);

                                buttonContainer.className = "field-buttons";
                                buttonSettings.innerHTML = "⚙️";
                                buttonSettings.title = "Propiedades";
                                buttonDelete.innerHTML = "🗑️";
                                buttonDelete.title = "Eliminar campo";

                                buttonContainer.appendChild(buttonSettings);
                                buttonContainer.appendChild(buttonDelete);
                                containerDiv.appendChild(buttonContainer);

                                container.appendChild(containerDiv);
                                makeDraggable(containerDiv);
                                makeResizable(containerDiv, resizeHandle);

                                // Al crear el campo se calcula la posición base en coordenadas PDF y se guarda en originalPdfData
                                propiedades.pdfData.pdfX = initialLeft / scale;
                                propiedades.pdfData.pdfFieldWidth = defaultWidth / scale;
                                propiedades.pdfData.pdfFieldHeight = defaultHeight / scale;
                                propiedades.pdfData.pdfY = (singleCanvas.height - initialTop - defaultHeight) / scale;

                                const fieldObj = {
                                    container: containerDiv,
                                    fieldElement: inputField, // Se crea apartir de las propiedades principales en db
                                    pdfData: propiedades.pdfData,
                                    originalPdfData: propiedades.pdfData,
                                    page: pageNum,
                                    originalPage: pageNum,
                                    id: Date.now(),
                                    idField: propiedades.idField,
                                    isEditable: propiedades.isEditable,
                                    name: propiedades.name,
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

                                containerDiv.addEventListener("click", (e) => {
                                    e.stopPropagation();
                                    hideAllButtonContainersExcept(containerDiv);

                                    const buttonContainer = containerDiv.querySelector('.field-buttons');
                                    if (buttonContainer) {
                                        buttonContainer.style.display = "block";
                                    }

                                    activeFieldObj = fieldObj;
                                });

                                containerDiv.addEventListener("focus", () => {
                                    hideAllButtonContainersExcept(containerDiv);

                                    const buttonContainer = containerDiv.querySelector('.field-buttons');
                                    if (buttonContainer) {
                                        buttonContainer.style.display = "block";
                                    }

                                    activeFieldObj = fieldObj;
                                });

                                containerDiv.addEventListener("blur", () => {
                                    buttonContainer.style.display = "none";
                                });

                                buttonDelete.addEventListener("click", (e) => {
                                    e.stopPropagation();
                                    containerDiv.remove();
                                    draggableFields = draggableFields.filter(item => item.container !== containerDiv);

                                    if (draggableFields.length == 0) {
                                        guardarCamposBtn.style.display = "none";
                                    }
                                });

                                buttonSettings.addEventListener("click", (e) => {
                                    e.stopPropagation();
                                    activeFieldObj = fieldObj;
                                    showPropertiesPanel(fieldObj);
                                });
                                break;
                            }

                            case TIPO_CAMPO_DATE: {
                                if (!pdfDoc) {
                                    alert("Primero carga un PDF.");
                                    return;
                                }

                                const inputField = document.createElement("input");
                                const containerDiv = document.createElement("div");
                                const resizeHandle = document.createElement("div");
                                const buttonContainer = document.createElement("div");
                                const buttonSettings = document.createElement("button");
                                const buttonDelete = document.createElement("button");
                                const objContainer = propiedades.container;
                                const defaultWidth = (objContainer.width) * scale;

                                const computedFontSize = propiedades.fontSize * scale;
                                const lineHeight = computedFontSize * FACTOR_HEIGHT_FONT_SIZE;
                                const defaultHeight = lineHeight;

                                const initialLeft = ((singleCanvas.width - defaultWidth) * scale) / 2;
                                const initialTop = ((singleCanvas.height - defaultHeight) * scale) / 2;

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
                                inputField.value = propiedades.text;
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
                                inputField.style.fontSize = (propiedades.fontSize) * scale + "px";
                                inputField.style.fontStyle = propiedades.fontStyle;
                                inputField.style.fontWeight = propiedades.fontWeight;
                                inputField.style.textDecoration = propiedades.textDecoration;

                                containerDiv.appendChild(inputField);
                                resizeHandle.className = "resize-handle";
                                containerDiv.appendChild(resizeHandle);

                                buttonContainer.className = "field-buttons";
                                buttonSettings.innerHTML = "⚙️";
                                buttonSettings.title = "Propiedades";
                                buttonDelete.innerHTML = "🗑️";
                                buttonDelete.title = "Eliminar campo";

                                buttonContainer.appendChild(buttonSettings);
                                buttonContainer.appendChild(buttonDelete);
                                containerDiv.appendChild(buttonContainer);

                                container.appendChild(containerDiv);
                                makeDraggable(containerDiv);
                                makeResizableOnlyX(containerDiv, resizeHandle);

                                // Al crear el campo se calcula la posición base en coordenadas PDF y se guarda en originalPdfData
                                propiedades.pdfData.pdfX = initialLeft / scale;
                                propiedades.pdfData.pdfFieldWidth = defaultWidth / scale;
                                propiedades.pdfData.pdfFieldHeight = defaultHeight / scale;
                                propiedades.pdfData.pdfY = (singleCanvas.height - initialTop - defaultHeight) / scale;

                                const fieldObj = {
                                    container: containerDiv,
                                    fieldElement: inputField, // Se crea apartir de las propiedades principales en db
                                    pdfData: propiedades.pdfData,
                                    originalPdfData: propiedades.pdfData,
                                    page: pageNum,
                                    originalPage: pageNum,
                                    id: Date.now(),
                                    idField: propiedades.idField,
                                    isEditable: propiedades.isEditable,
                                    name: propiedades.name,
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

                                containerDiv.addEventListener("click", (e) => {
                                    e.stopPropagation();
                                    hideAllButtonContainersExcept(containerDiv);

                                    const buttonContainer = containerDiv.querySelector('.field-buttons');
                                    if (buttonContainer) {
                                        buttonContainer.style.display = "block";
                                    }

                                    activeFieldObj = fieldObj;
                                });

                                containerDiv.addEventListener("focus", () => {
                                    hideAllButtonContainersExcept(containerDiv);

                                    const buttonContainer = containerDiv.querySelector('.field-buttons');
                                    if (buttonContainer) {
                                        buttonContainer.style.display = "block";
                                    }

                                    activeFieldObj = fieldObj;
                                });

                                containerDiv.addEventListener("blur", () => {
                                    buttonContainer.style.display = "none";
                                });

                                buttonDelete.addEventListener("click", (e) => {
                                    e.stopPropagation();
                                    containerDiv.remove();
                                    draggableFields = draggableFields.filter(item => item.container !== containerDiv);

                                    if (draggableFields.length == 0) {
                                        guardarCamposBtn.style.display = "none";
                                    }
                                });

                                buttonSettings.addEventListener("click", (e) => {
                                    e.stopPropagation();
                                    activeFieldObj = fieldObj;
                                    showPropertiesPanel(fieldObj);
                                });
                                break;
                            }

                            default:
                                break;
                        }
                    }
                });

                $('#toolbar').append(button);
            });
        },
        onError: function (xhr, status, error) {
            console.error('onError:', status, error);
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

            mostrarControlesEdicion(true);
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
        fields.forEach(field => {
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
                    const resizeHandle = document.createElement("div");
                    const buttonContainer = document.createElement("div");
                    const buttonSettings = document.createElement("button");
                    const buttonDelete = document.createElement("button");
                    const objContainer = properties.container;
                    const defaultWidth = objContainer.width * scale;

                    const computedFontSize = propiedades.fontSize * scale;
                    const lineHeight = computedFontSize * FACTOR_HEIGHT_FONT_SIZE;
                    const defaultHeight = lineHeight;

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
                    inputField.value = propiedades.text;
                    inputField.style.background = "transparent";
                    inputField.style.position = "absolute";
                    inputField.style.width = propiedades.width;
                    inputField.style.height = propiedades.height;
                    inputField.style.border = propiedades.border;
                    inputField.style.outline = propiedades.outline;
                    inputField.style.textAlign = propiedades.textAlign;
                    inputField.style.color = propiedades.color;
                    inputField.style.fontFamily = propiedades.fontFamily;
                    inputField.style.fontSize = propiedades.fontSize + "px";
                    inputField.style.fontStyle = propiedades.fontStyle;
                    inputField.style.fontWeight = propiedades.fontWeight;
                    inputField.style.textDecoration = propiedades.textDecoration;

                    inputField.addEventListener("input", function () {
                        const fieldObj = draggableFields.find(field => field.fieldElement === inputField);

                        if (fieldObj) {
                            fieldObj.properties.text = inputField.value;
                            fieldObj.name = inputField.value;
                        }
                    });

                    containerDiv.appendChild(inputField);
                    resizeHandle.className = "resize-handle";
                    containerDiv.appendChild(resizeHandle);

                    buttonContainer.className = "field-buttons";
                    buttonSettings.innerHTML = "⚙️";
                    buttonSettings.title = "Propiedades";
                    buttonDelete.innerHTML = "🗑️";
                    buttonDelete.title = "Eliminar campo";

                    buttonContainer.appendChild(buttonSettings);
                    buttonContainer.appendChild(buttonDelete);
                    containerDiv.appendChild(buttonContainer);

                    container.appendChild(containerDiv);
                    makeDraggable(containerDiv);
                    makeResizableOnlyX(containerDiv, resizeHandle);

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

                    containerDiv.addEventListener("click", (e) => {
                        e.stopPropagation();
                        hideAllButtonContainersExcept(containerDiv);

                        const buttonContainer = containerDiv.querySelector('.field-buttons');
                        if (buttonContainer) {
                            buttonContainer.style.display = "block";
                        }

                        activeFieldObj = fieldObj;
                    });

                    containerDiv.addEventListener("focus", () => {
                        hideAllButtonContainersExcept(containerDiv);

                        const buttonContainer = containerDiv.querySelector('.field-buttons');
                        if (buttonContainer) {
                            buttonContainer.style.display = "block";
                        }

                        activeFieldObj = fieldObj;
                    });

                    containerDiv.addEventListener("blur", () => {
                        buttonContainer.style.display = "none";
                    });

                    buttonDelete.addEventListener("click", (e) => {
                        e.stopPropagation();
                        containerDiv.remove();
                        draggableFields = draggableFields.filter(item => item.container !== containerDiv);

                        if (draggableFields.length == 0) {
                            guardarCamposBtn.style.display = "none";
                        }
                    });

                    buttonSettings.addEventListener("click", (e) => {
                        e.stopPropagation();
                        activeFieldObj = fieldObj;
                        showPropertiesPanel(fieldObj);
                    });
                    break;
                }

                case TIPO_CAMPO_SELECT: {
                    if (!pdfDoc) {
                        alert("Primero carga un PDF.");
                        return;
                    }

                    const selectField = document.createElement("select");
                    const containerDiv = document.createElement("div");
                    const resizeHandle = document.createElement("div");
                    const buttonContainer = document.createElement("div");
                    const buttonSettings = document.createElement("button");
                    const buttonDelete = document.createElement("button");
                    const objContainer = properties.container;
                    const defaultWidth = objContainer.width * scale;

                    const computedFontSize = propiedades.fontSize * scale;
                    const lineHeight = computedFontSize * FACTOR_HEIGHT_FONT_SIZE_SELECT;
                    const defaultHeight = lineHeight;

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
                    selectField.style.fontSize = propiedades.fontSize + "px";
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
                    resizeHandle.className = "resize-handle";
                    containerDiv.appendChild(resizeHandle);

                    buttonContainer.className = "field-buttons";
                    buttonSettings.innerHTML = "⚙️";
                    buttonSettings.title = "Propiedades";
                    buttonDelete.innerHTML = "🗑️";
                    buttonDelete.title = "Eliminar campo";

                    buttonContainer.appendChild(buttonSettings);
                    buttonContainer.appendChild(buttonDelete);
                    containerDiv.appendChild(buttonContainer);

                    container.appendChild(containerDiv);
                    makeDraggable(containerDiv);
                    makeResizableOnlyX(containerDiv, resizeHandle);

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

                    containerDiv.addEventListener("click", (e) => {
                        e.stopPropagation();
                        hideAllButtonContainersExcept(containerDiv);

                        const buttonContainer = containerDiv.querySelector('.field-buttons');
                        if (buttonContainer) {
                            buttonContainer.style.display = "block";
                        }

                        activeFieldObj = fieldObj;
                    });

                    containerDiv.addEventListener("focus", () => {
                        hideAllButtonContainersExcept(containerDiv);

                        const buttonContainer = containerDiv.querySelector('.field-buttons');
                        if (buttonContainer) {
                            buttonContainer.style.display = "block";
                        }

                        activeFieldObj = fieldObj;
                    });

                    containerDiv.addEventListener("blur", () => {
                        buttonContainer.style.display = "none";
                    });

                    buttonDelete.addEventListener("click", (e) => {
                        e.stopPropagation();
                        containerDiv.remove();
                        draggableFields = draggableFields.filter(item => item.container !== containerDiv);

                        if (draggableFields.length == 0) {
                            guardarCamposBtn.style.display = "none";
                        }
                    });

                    buttonSettings.addEventListener("click", (e) => {
                        e.stopPropagation();
                        activeFieldObj = fieldObj;
                        showPropertiesPanel(fieldObj);
                    });
                    break;
                }

                case TIPO_CAMPO_QR: {
                    if (!pdfDoc) {
                        alert("Primero carga un PDF.");
                        return;
                    }

                    const imgField = document.createElement("img");
                    const containerDiv = document.createElement("div");
                    const resizeHandle = document.createElement("div");
                    const buttonContainer = document.createElement("div");
                    const buttonSettings = document.createElement("button");
                    const buttonDelete = document.createElement("button");
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

                    containerDiv.appendChild(imgField);
                    resizeHandle.className = "resize-handle";
                    containerDiv.appendChild(resizeHandle);

                    buttonContainer.className = "field-buttons";
                    buttonSettings.innerHTML = "⚙️";
                    buttonSettings.title = "Propiedades";
                    buttonDelete.innerHTML = "🗑️";
                    buttonDelete.title = "Eliminar campo";

                    buttonContainer.appendChild(buttonSettings);
                    buttonContainer.appendChild(buttonDelete);
                    containerDiv.appendChild(buttonContainer);

                    container.appendChild(containerDiv);
                    makeDraggable(containerDiv);
                    makeResizable(containerDiv, resizeHandle);

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

                    containerDiv.addEventListener("click", (e) => {
                        e.stopPropagation();
                        hideAllButtonContainersExcept(containerDiv);

                        const buttonContainer = containerDiv.querySelector('.field-buttons');
                        if (buttonContainer) {
                            buttonContainer.style.display = "block";
                        }

                        activeFieldObj = fieldObj;
                    });

                    containerDiv.addEventListener("focus", () => {
                        hideAllButtonContainersExcept(containerDiv);

                        const buttonContainer = containerDiv.querySelector('.field-buttons');
                        if (buttonContainer) {
                            buttonContainer.style.display = "block";
                        }

                        activeFieldObj = fieldObj;
                    });

                    containerDiv.addEventListener("blur", () => {
                        buttonContainer.style.display = "none";
                    });

                    buttonDelete.addEventListener("click", (e) => {
                        e.stopPropagation();
                        containerDiv.remove();
                        draggableFields = draggableFields.filter(item => item.container !== containerDiv);

                        if (draggableFields.length == 0) {
                            guardarCamposBtn.style.display = "none";
                        }
                    });

                    buttonSettings.addEventListener("click", (e) => {
                        e.stopPropagation();
                        activeFieldObj = fieldObj;
                        showPropertiesPanel(fieldObj);
                    });
                    break;
                }

                case TIPO_CAMPO_TEXT_AREA: {
                    if (!pdfDoc) {
                        alert("Primero carga un PDF.");
                        return;
                    }

                    const inputField = document.createElement("textarea");
                    const containerDiv = document.createElement("div");
                    const resizeHandle = document.createElement("div");
                    const buttonContainer = document.createElement("div");
                    const buttonSettings = document.createElement("button");
                    const buttonDelete = document.createElement("button");
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
                    inputField.value = propiedades.text;
                    inputField.style.background = "transparent";
                    inputField.style.position = "absolute";
                    inputField.style.overflow = "hidden";
                    inputField.style.width = propiedades.width;
                    inputField.style.height = propiedades.height;
                    inputField.style.border = propiedades.border;
                    inputField.style.outline = propiedades.outline;
                    inputField.style.textAlign = propiedades.textAlign;
                    inputField.style.color = propiedades.color;
                    inputField.style.fontFamily = propiedades.fontFamily;
                    inputField.style.fontSize = propiedades.fontSize + "px";
                    inputField.style.fontStyle = propiedades.fontStyle;
                    inputField.style.fontWeight = propiedades.fontWeight;
                    inputField.style.textDecoration = propiedades.textDecoration;

                    inputField.addEventListener("input", function () {
                        const fieldObj = draggableFields.find(field => field.fieldElement === inputField);

                        if (fieldObj) {
                            fieldObj.properties.text = inputField.value;
                            fieldObj.name = inputField.value;
                        }
                    });

                    containerDiv.appendChild(inputField);
                    resizeHandle.className = "resize-handle";
                    containerDiv.appendChild(resizeHandle);

                    buttonContainer.className = "field-buttons";
                    buttonSettings.innerHTML = "⚙️";
                    buttonSettings.title = "Propiedades";
                    buttonDelete.innerHTML = "🗑️";
                    buttonDelete.title = "Eliminar campo";

                    buttonContainer.appendChild(buttonSettings);
                    buttonContainer.appendChild(buttonDelete);
                    containerDiv.appendChild(buttonContainer);

                    container.appendChild(containerDiv);
                    makeDraggable(containerDiv);
                    makeResizable(containerDiv, resizeHandle);

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

                    containerDiv.addEventListener("click", (e) => {
                        e.stopPropagation();
                        hideAllButtonContainersExcept(containerDiv);

                        const buttonContainer = containerDiv.querySelector('.field-buttons');
                        if (buttonContainer) {
                            buttonContainer.style.display = "block";
                        }

                        activeFieldObj = fieldObj;
                    });

                    containerDiv.addEventListener("focus", () => {
                        hideAllButtonContainersExcept(containerDiv);

                        const buttonContainer = containerDiv.querySelector('.field-buttons');
                        if (buttonContainer) {
                            buttonContainer.style.display = "block";
                        }

                        activeFieldObj = fieldObj;
                    });

                    containerDiv.addEventListener("blur", () => {
                        buttonContainer.style.display = "none";
                    });

                    buttonDelete.addEventListener("click", (e) => {
                        e.stopPropagation();
                        containerDiv.remove();
                        draggableFields = draggableFields.filter(item => item.container !== containerDiv);

                        if (draggableFields.length == 0) {
                            guardarCamposBtn.style.display = "none";
                        }
                    });

                    buttonSettings.addEventListener("click", (e) => {
                        e.stopPropagation();
                        activeFieldObj = fieldObj;
                        showPropertiesPanel(fieldObj);
                    });
                    break;
                }

                case TIPO_CAMPO_DATE: {
                    if (!pdfDoc) {
                        alert("Primero carga un PDF.");
                        return;
                    }

                    const inputField = document.createElement("input");
                    const containerDiv = document.createElement("div");
                    const resizeHandle = document.createElement("div");
                    const buttonContainer = document.createElement("div");
                    const buttonSettings = document.createElement("button");
                    const buttonDelete = document.createElement("button");
                    const objContainer = properties.container;
                    const defaultWidth = objContainer.width * scale;

                    const computedFontSize = propiedades.fontSize * scale;
                    const lineHeight = computedFontSize * FACTOR_HEIGHT_FONT_SIZE;
                    const defaultHeight = lineHeight;

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
                    inputField.value = propiedades.text;
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
                    inputField.style.fontSize = propiedades.fontSize + "px";
                    inputField.style.fontStyle = propiedades.fontStyle;
                    inputField.style.fontWeight = propiedades.fontWeight;
                    inputField.style.textDecoration = propiedades.textDecoration;

                    containerDiv.appendChild(inputField);
                    resizeHandle.className = "resize-handle";
                    containerDiv.appendChild(resizeHandle);

                    buttonContainer.className = "field-buttons";
                    buttonSettings.innerHTML = "⚙️";
                    buttonSettings.title = "Propiedades";
                    buttonDelete.innerHTML = "🗑️";
                    buttonDelete.title = "Eliminar campo";

                    buttonContainer.appendChild(buttonSettings);
                    buttonContainer.appendChild(buttonDelete);
                    containerDiv.appendChild(buttonContainer);

                    container.appendChild(containerDiv);
                    makeDraggable(containerDiv);
                    makeResizableOnlyX(containerDiv, resizeHandle);

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

                    containerDiv.addEventListener("click", (e) => {
                        e.stopPropagation();
                        hideAllButtonContainersExcept(containerDiv);

                        const buttonContainer = containerDiv.querySelector('.field-buttons');
                        if (buttonContainer) {
                            buttonContainer.style.display = "block";
                        }

                        activeFieldObj = fieldObj;
                    });

                    containerDiv.addEventListener("focus", () => {
                        hideAllButtonContainersExcept(containerDiv);

                        const buttonContainer = containerDiv.querySelector('.field-buttons');
                        if (buttonContainer) {
                            buttonContainer.style.display = "block";
                        }

                        activeFieldObj = fieldObj;
                    });

                    containerDiv.addEventListener("blur", () => {
                        buttonContainer.style.display = "none";
                    });

                    buttonDelete.addEventListener("click", (e) => {
                        e.stopPropagation();
                        containerDiv.remove();
                        draggableFields = draggableFields.filter(item => item.container !== containerDiv);

                        if (draggableFields.length == 0) {
                            guardarCamposBtn.style.display = "none";
                        }
                    });

                    buttonSettings.addEventListener("click", (e) => {
                        e.stopPropagation();
                        activeFieldObj = fieldObj;
                        showPropertiesPanel(fieldObj);
                    });
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
                    const containerDiv = field.container;
                    $(containerDiv).html("");
                    const resizeHandle = document.createElement("div");
                    const buttonContainer = document.createElement("div");
                    const buttonSettings = document.createElement("button");
                    const buttonDelete = document.createElement("button");

                    const defaultWidth = containerDiv.dataset.originWidth * scale;
                    const defaultHeight = containerDiv.dataset.originHeight * scale;
                    const initialLeft = containerDiv.dataset.originLeft * scale;
                    const initialTop = containerDiv.dataset.originTop * scale;

                    containerDiv.style.width = defaultWidth + "px";
                    containerDiv.style.height = defaultHeight + "px";
                    containerDiv.style.left = initialLeft + "px";
                    containerDiv.style.top = initialTop + "px";

                    $(containerDiv).append(inputField);
                    resizeHandle.className = "resize-handle";
                    $(containerDiv).append(resizeHandle);

                    buttonContainer.className = "field-buttons";
                    buttonSettings.innerHTML = "⚙️";
                    buttonSettings.title = "Propiedades";
                    buttonDelete.innerHTML = "🗑️";
                    buttonDelete.title = "Eliminar campo";

                    buttonContainer.appendChild(buttonSettings);
                    buttonContainer.appendChild(buttonDelete);
                    containerDiv.appendChild(buttonContainer);

                    container.appendChild(containerDiv);
                    makeDraggable(containerDiv);
                    makeResizableOnlyX(containerDiv, resizeHandle);

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

                    containerDiv.addEventListener("click", (e) => {
                        e.stopPropagation();
                        hideAllButtonContainersExcept(containerDiv);

                        const buttonContainer = containerDiv.querySelector('.field-buttons');
                        if (buttonContainer) {
                            buttonContainer.style.display = "block";
                        }

                        activeFieldObj = fieldObj;
                    });

                    containerDiv.addEventListener("focus", () => {
                        hideAllButtonContainersExcept(containerDiv);

                        const buttonContainer = containerDiv.querySelector('.field-buttons');
                        if (buttonContainer) {
                            buttonContainer.style.display = "block";
                        }

                        activeFieldObj = fieldObj;
                    });

                    containerDiv.addEventListener("blur", () => {
                        buttonContainer.style.display = "none";
                    });

                    buttonDelete.addEventListener("click", (e) => {
                        e.stopPropagation();
                        containerDiv.remove();
                        draggableFields = draggableFields.filter(item => item.container !== containerDiv);

                        if (draggableFields.length == 0) {
                            guardarCamposBtn.style.display = "none";
                        }
                    });

                    buttonSettings.addEventListener("click", (e) => {
                        e.stopPropagation();
                        activeFieldObj = fieldObj;
                        showPropertiesPanel(fieldObj);
                    });
                    break;
                }

                case TIPO_CAMPO_SELECT: {
                    if (!pdfDoc) {
                        alert("Primero carga un PDF.");
                        return;
                    }

                    const selectField = field.fieldElement;
                    const containerDiv = field.container;
                    $(containerDiv).html("");
                    const resizeHandle = document.createElement("div");
                    const buttonContainer = document.createElement("div");
                    const buttonSettings = document.createElement("button");
                    const buttonDelete = document.createElement("button");

                    const defaultWidth = containerDiv.dataset.originWidth * scale;
                    const defaultHeight = containerDiv.dataset.originHeight * scale;
                    const initialLeft = containerDiv.dataset.originLeft * scale;
                    const initialTop = containerDiv.dataset.originTop * scale;

                    containerDiv.style.width = defaultWidth + "px";
                    containerDiv.style.height = defaultHeight + "px";
                    containerDiv.style.left = initialLeft + "px";
                    containerDiv.style.top = initialTop + "px";

                    $(containerDiv).append(selectField);
                    resizeHandle.className = "resize-handle";
                    $(containerDiv).append(resizeHandle);

                    buttonContainer.className = "field-buttons";
                    buttonSettings.innerHTML = "⚙️";
                    buttonSettings.title = "Propiedades";
                    buttonDelete.innerHTML = "🗑️";
                    buttonDelete.title = "Eliminar campo";

                    buttonContainer.appendChild(buttonSettings);
                    buttonContainer.appendChild(buttonDelete);
                    containerDiv.appendChild(buttonContainer);

                    container.appendChild(containerDiv);
                    makeDraggable(containerDiv);
                    makeResizable(containerDiv, resizeHandle);

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

                    containerDiv.addEventListener("click", (e) => {
                        e.stopPropagation();
                        hideAllButtonContainersExcept(containerDiv);

                        const buttonContainer = containerDiv.querySelector('.field-buttons');
                        if (buttonContainer) {
                            buttonContainer.style.display = "block";
                        }

                        activeFieldObj = fieldObj;
                    });

                    containerDiv.addEventListener("focus", () => {
                        hideAllButtonContainersExcept(containerDiv);

                        const buttonContainer = containerDiv.querySelector('.field-buttons');
                        if (buttonContainer) {
                            buttonContainer.style.display = "block";
                        }

                        activeFieldObj = fieldObj;
                    });

                    containerDiv.addEventListener("blur", () => {
                        buttonContainer.style.display = "none";
                    });

                    buttonDelete.addEventListener("click", (e) => {
                        e.stopPropagation();
                        containerDiv.remove();
                        draggableFields = draggableFields.filter(item => item.container !== containerDiv);

                        if (draggableFields.length == 0) {
                            guardarCamposBtn.style.display = "none";
                        }
                    });

                    buttonSettings.addEventListener("click", (e) => {
                        e.stopPropagation();
                        activeFieldObj = fieldObj;
                        showPropertiesPanel(fieldObj);
                    });
                    break;
                }

                case TIPO_CAMPO_QR: {
                    if (!pdfDoc) {
                        alert("Primero carga un PDF.");
                        return;
                    }

                    const imgField = field.fieldElement;
                    const containerDiv = field.container;
                    $(containerDiv).html("");
                    const resizeHandle = document.createElement("div");
                    const buttonContainer = document.createElement("div");
                    const buttonSettings = document.createElement("button");
                    const buttonDelete = document.createElement("button");

                    const defaultWidth = containerDiv.dataset.originWidth * scale;
                    const defaultHeight = containerDiv.dataset.originHeight * scale;
                    const initialLeft = containerDiv.dataset.originLeft * scale;
                    const initialTop = containerDiv.dataset.originTop * scale;

                    containerDiv.style.width = defaultWidth + "px";
                    containerDiv.style.height = defaultHeight + "px";
                    containerDiv.style.left = initialLeft + "px";
                    containerDiv.style.top = initialTop + "px";

                    $(containerDiv).append(imgField);
                    resizeHandle.className = "resize-handle";
                    $(containerDiv).append(resizeHandle);

                    buttonContainer.className = "field-buttons";
                    buttonSettings.innerHTML = "⚙️";
                    buttonSettings.title = "Propiedades";
                    buttonDelete.innerHTML = "🗑️";
                    buttonDelete.title = "Eliminar campo";

                    buttonContainer.appendChild(buttonSettings);
                    buttonContainer.appendChild(buttonDelete);
                    containerDiv.appendChild(buttonContainer);

                    container.appendChild(containerDiv);
                    makeDraggable(containerDiv);
                    makeResizable(containerDiv, resizeHandle);

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

                    containerDiv.addEventListener("click", (e) => {
                        e.stopPropagation();
                        hideAllButtonContainersExcept(containerDiv);

                        const buttonContainer = containerDiv.querySelector('.field-buttons');
                        if (buttonContainer) {
                            buttonContainer.style.display = "block";
                        }

                        activeFieldObj = fieldObj;
                    });

                    containerDiv.addEventListener("focus", () => {
                        hideAllButtonContainersExcept(containerDiv);

                        const buttonContainer = containerDiv.querySelector('.field-buttons');
                        if (buttonContainer) {
                            buttonContainer.style.display = "block";
                        }

                        activeFieldObj = fieldObj;
                    });

                    containerDiv.addEventListener("blur", () => {
                        buttonContainer.style.display = "none";
                    });

                    buttonDelete.addEventListener("click", (e) => {
                        e.stopPropagation();
                        containerDiv.remove();
                        draggableFields = draggableFields.filter(item => item.container !== containerDiv);

                        if (draggableFields.length == 0) {
                            guardarCamposBtn.style.display = "none";
                        }
                    });

                    buttonSettings.addEventListener("click", (e) => {
                        e.stopPropagation();
                        activeFieldObj = fieldObj;
                        showPropertiesPanel(fieldObj);
                    });
                    break;
                }

                case TIPO_CAMPO_TEXT_AREA: {
                    if (!pdfDoc) {
                        alert("Primero carga un PDF.");
                        return;
                    }

                    const inputField = field.fieldElement;
                    const containerDiv = field.container;
                    $(containerDiv).html("");
                    const resizeHandle = document.createElement("div");
                    const buttonContainer = document.createElement("div");
                    const buttonSettings = document.createElement("button");
                    const buttonDelete = document.createElement("button");

                    const defaultWidth = containerDiv.dataset.originWidth * scale;
                    const defaultHeight = containerDiv.dataset.originHeight * scale;
                    const initialLeft = containerDiv.dataset.originLeft * scale;
                    const initialTop = containerDiv.dataset.originTop * scale;

                    containerDiv.style.width = defaultWidth + "px";
                    containerDiv.style.height = defaultHeight + "px";
                    containerDiv.style.left = initialLeft + "px";
                    containerDiv.style.top = initialTop + "px";

                    $(containerDiv).append(inputField);
                    resizeHandle.className = "resize-handle";
                    $(containerDiv).append(resizeHandle);

                    buttonContainer.className = "field-buttons";
                    buttonSettings.innerHTML = "⚙️";
                    buttonSettings.title = "Propiedades";
                    buttonDelete.innerHTML = "🗑️";
                    buttonDelete.title = "Eliminar campo";

                    buttonContainer.appendChild(buttonSettings);
                    buttonContainer.appendChild(buttonDelete);
                    containerDiv.appendChild(buttonContainer);

                    container.appendChild(containerDiv);
                    makeDraggable(containerDiv);
                    makeResizable(containerDiv, resizeHandle);

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

                    containerDiv.addEventListener("click", (e) => {
                        e.stopPropagation();
                        hideAllButtonContainersExcept(containerDiv);

                        const buttonContainer = containerDiv.querySelector('.field-buttons');
                        if (buttonContainer) {
                            buttonContainer.style.display = "block";
                        }

                        activeFieldObj = fieldObj;
                    });

                    containerDiv.addEventListener("focus", () => {
                        hideAllButtonContainersExcept(containerDiv);

                        const buttonContainer = containerDiv.querySelector('.field-buttons');
                        if (buttonContainer) {
                            buttonContainer.style.display = "block";
                        }

                        activeFieldObj = fieldObj;
                    });

                    containerDiv.addEventListener("blur", () => {
                        buttonContainer.style.display = "none";
                    });

                    buttonDelete.addEventListener("click", (e) => {
                        e.stopPropagation();
                        containerDiv.remove();
                        draggableFields = draggableFields.filter(item => item.container !== containerDiv);

                        if (draggableFields.length == 0) {
                            guardarCamposBtn.style.display = "none";
                        }
                    });

                    buttonSettings.addEventListener("click", (e) => {
                        e.stopPropagation();
                        activeFieldObj = fieldObj;
                        showPropertiesPanel(fieldObj);
                    });
                    break;
                }

                case TIPO_CAMPO_DATE: {
                    if (!pdfDoc) {
                        alert("Primero carga un PDF.");
                        return;
                    }

                    const inputField = field.fieldElement;
                    const containerDiv = field.container;
                    $(containerDiv).html("");
                    const resizeHandle = document.createElement("div");
                    const buttonContainer = document.createElement("div");
                    const buttonSettings = document.createElement("button");
                    const buttonDelete = document.createElement("button");

                    const defaultWidth = containerDiv.dataset.originWidth * scale;
                    const defaultHeight = containerDiv.dataset.originHeight * scale;
                    const initialLeft = containerDiv.dataset.originLeft * scale;
                    const initialTop = containerDiv.dataset.originTop * scale;

                    containerDiv.style.width = defaultWidth + "px";
                    containerDiv.style.height = defaultHeight + "px";
                    containerDiv.style.left = initialLeft + "px";
                    containerDiv.style.top = initialTop + "px";

                    $(containerDiv).append(inputField);
                    resizeHandle.className = "resize-handle";
                    $(containerDiv).append(resizeHandle);

                    buttonContainer.className = "field-buttons";
                    buttonSettings.innerHTML = "⚙️";
                    buttonSettings.title = "Propiedades";
                    buttonDelete.innerHTML = "🗑️";
                    buttonDelete.title = "Eliminar campo";

                    buttonContainer.appendChild(buttonSettings);
                    buttonContainer.appendChild(buttonDelete);
                    containerDiv.appendChild(buttonContainer);

                    container.appendChild(containerDiv);
                    makeDraggable(containerDiv);
                    makeResizableOnlyX(containerDiv, resizeHandle);

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

                    containerDiv.addEventListener("click", (e) => {
                        e.stopPropagation();
                        hideAllButtonContainersExcept(containerDiv);

                        const buttonContainer = containerDiv.querySelector('.field-buttons');
                        if (buttonContainer) {
                            buttonContainer.style.display = "block";
                        }

                        activeFieldObj = fieldObj;
                    });

                    containerDiv.addEventListener("focus", () => {
                        hideAllButtonContainersExcept(containerDiv);

                        const buttonContainer = containerDiv.querySelector('.field-buttons');
                        if (buttonContainer) {
                            buttonContainer.style.display = "block";
                        }

                        activeFieldObj = fieldObj;
                    });

                    containerDiv.addEventListener("blur", () => {
                        buttonContainer.style.display = "none";
                    });

                    buttonDelete.addEventListener("click", (e) => {
                        e.stopPropagation();
                        containerDiv.remove();
                        draggableFields = draggableFields.filter(item => item.container !== containerDiv);

                        if (draggableFields.length == 0) {
                            guardarCamposBtn.style.display = "none";
                        }
                    });

                    buttonSettings.addEventListener("click", (e) => {
                        e.stopPropagation();
                        activeFieldObj = fieldObj;
                        showPropertiesPanel(fieldObj);
                    });
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

// Se actualiza la posición y dimensiones en coordenadas PDF y se guarda en originalPdfData
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

function updateFieldPDFDataForElement(el) {
    draggableFields.forEach(fieldObj => {
        if (fieldObj.container === el) {
            updateFieldPDFData(fieldObj);
        }
    });
}

function makeDraggable(el) {
    let startX = 0, startY = 0, dragging = false, offsetX = 0, offsetY = 0;

    function mouseDownHandler(e) {
        startX = e.clientX;
        startY = e.clientY;
        offsetX = e.clientX - el.getBoundingClientRect().left;
        offsetY = e.clientY - el.getBoundingClientRect().top;
        dragging = false;
        window.addEventListener('mousemove', mouseMoveHandler);
        window.addEventListener('mouseup', mouseUpHandler);
    }

    function mouseMoveHandler(e) {
        const dx = e.clientX - startX, dy = e.clientY - startY;

        if (!dragging && Math.sqrt(dx * dx + dy * dy) > 5) {
            dragging = true;
            e.preventDefault();
        }

        if (dragging) {
            let boundingRect;

            if (viewAll && el.parentNode) {
                boundingRect = el.parentNode.getBoundingClientRect();
            } else {
                boundingRect = container.getBoundingClientRect();
            }

            let newLeft = e.clientX - boundingRect.left - offsetX;
            let newTop = e.clientY - boundingRect.top - offsetY;

            if (newLeft < 0) newLeft = 0;

            if (newTop < 0) newTop = 0;
            let limitWidth = (viewAll && el.parentNode) ? el.parentNode.clientWidth : container.clientWidth;
            let limitHeight = (viewAll && el.parentNode) ? el.parentNode.clientHeight : container.clientHeight;

            if (newLeft + el.offsetWidth > limitWidth) newLeft = limitWidth - el.offsetWidth;

            if (newTop + el.offsetHeight > limitHeight) newTop = limitHeight - el.offsetHeight;

            el.style.left = newLeft + "px";
            el.style.top = newTop + "px";

            el.dataset.originLeft = newLeft / scale;
            el.dataset.originTop = newTop / scale;
        }
    }

    function mouseUpHandler(e) {
        window.removeEventListener('mousemove', mouseMoveHandler);
        window.removeEventListener('mouseup', mouseUpHandler);

        if (dragging) {
            updateFieldPDFDataForElement(el);
        }
    }

    el.addEventListener('mousedown', mouseDownHandler);
}

function makeResizable(containerEl, handle) {
    let startX, startY, startWidth, startHeight;

    handle.addEventListener('mousedown', function (e) {
        e.stopPropagation();
        startX = e.clientX;
        startY = e.clientY;
        startWidth = containerEl.offsetWidth;
        startHeight = containerEl.offsetHeight;
        window.addEventListener('mousemove', resizeMouseMove);
        window.addEventListener('mouseup', resizeMouseUp);
    });

    function resizeMouseMove(e) {
        let newWidth = startWidth + (e.clientX - startX);
        let newHeight = startHeight + (e.clientY - startY);
        containerEl.style.width = newWidth + "px";
        containerEl.style.height = newHeight + "px";

        containerEl.dataset.originWidth = newWidth / scale;
        containerEl.dataset.originHeight = newHeight / scale;
    }

    function resizeMouseUp(e) {
        window.removeEventListener('mousemove', resizeMouseMove);
        window.removeEventListener('mouseup', resizeMouseUp);
        updateFieldPDFDataForElement(containerEl);
    }
}

function makeResizableOnlyX(containerEl, handle) {
    let startX, startWidth;

    handle.addEventListener('mousedown', function (e) {
        e.stopPropagation();
        startX = e.clientX;
        startWidth = containerEl.offsetWidth;
        window.addEventListener('mousemove', resizeMouseMove);
        window.addEventListener('mouseup', resizeMouseUp);
    });

    function resizeMouseMove(e) {
        let newWidth = startWidth + (e.clientX - startX);
        containerEl.style.width = newWidth + "px";
        containerEl.dataset.originWidth = newWidth / scale;
    }

    function resizeMouseUp(e) {
        window.removeEventListener('mousemove', resizeMouseMove);
        window.removeEventListener('mouseup', resizeMouseUp);
        updateFieldPDFDataForElement(containerEl);
    }
}

function addOptionSelect() {
    const optionsContainer = document.getElementById("select-options-container");
    const optionDiv = document.createElement("div");
    optionDiv.style.marginBottom = "5px";

    const inputOpt = document.createElement("input");
    inputOpt.type = "text";
    inputOpt.value = "";
    inputOpt.style.width = "70%";

    const removeBtn = document.createElement("button");
    removeBtn.innerHTML = "🗑️";
    removeBtn.style.marginLeft = "5px";

    removeBtn.addEventListener("click", () => {
        optionDiv.remove();
    });

    optionDiv.appendChild(inputOpt);
    optionDiv.appendChild(removeBtn);
    optionsContainer.appendChild(optionDiv);
}

function hideAllButtonContainersExcept(activeContainer) {
    draggableFields.forEach(fieldObj => {
        if (fieldObj.container !== activeContainer) {
            const btnCont = fieldObj.container.querySelector('.field-buttons');

            if (btnCont) {
                btnCont.style.display = "none";
            }
        }
    });
}

function showPropertiesPanel(fieldObj) {
    if (fieldObj.properties == undefined) {
        return;
    }

    const props = fieldObj.properties;
    $("#field-properties").removeClass("hidden");
    $("div.contProp").addClass("hidden");

    switch (parseInt(fieldObj.idField)) {
        case TIPO_CAMPO_TEXT:
            $("div.propText").removeClass("hidden");

            $("#font-family").val(props.fontFamily);
            $("#font-size").val(props.fontSize);
            $("#font-bold").prop("checked", (props.fontWeight == "bold" ? true : false));
            $("#font-italic").prop("checked", (props.fontStyle == "italic" ? true : false));
            $("#font-color").val(props.color);
            break;
        case TIPO_CAMPO_SELECT:
            $("div.propDropdown").removeClass("hidden");
            $("#add-option").off("click", addOptionSelect);

            $("#font-family").val(props.fontFamily);
            $("#font-size").val(props.fontSize);
            $("#font-bold").prop("checked", (props.fontWeight == "bold" ? true : false));
            $("#font-italic").prop("checked", (props.fontStyle == "italic" ? true : false));
            $("#font-color").val(props.color);

            $("#select-options-container").empty();

            props.options.forEach((opt, index) => {
                const $optionDiv = $("<div>").css("margin-bottom", "5px");

                const $inputOpt = $("<input>", {
                    type: "text",
                    value: opt.name,
                    "data-value": opt.id,
                    "data-index": index,
                    css: { width: "70%" }
                });

                const $removeBtn = $("<button>", {
                    html: "🗑️",
                    css: { "margin-left": "5px" },
                    click: function () {
                        fieldObj.properties.options.splice(index, 1);
                        $optionDiv.remove();
                    }
                });

                $optionDiv.append($inputOpt, $removeBtn);
                $("#select-options-container").append($optionDiv);
            });

            $("#add-option").on("click", addOptionSelect);
            break;
        case TIPO_CAMPO_QR:
            $("div.propQR").removeClass("hidden");

            const $opacityInput = $("#image-opacity");
            $opacityInput.val(fieldObj.properties.opacity);
            $("#image-opacity-value").text(fieldObj.properties.opacity);
            break;
        case TIPO_CAMPO_TEXT_AREA:
            $("div.propTextarea").removeClass("hidden");

            $("#font-family").val(props.fontFamily);
            $("#font-size").val(props.fontSize);
            $("#font-bold").prop("checked", (props.fontWeight == "bold" ? true : false));
            $("#font-italic").prop("checked", (props.fontStyle == "italic" ? true : false));
            $("#font-color").val(props.color);
            break;
        case TIPO_CAMPO_DATE:
            $("div.propDate").removeClass("hidden");

            $("#font-family").val(props.fontFamily);
            $("#font-size").val(props.fontSize);
            $("#font-bold").prop("checked", (props.fontWeight == "bold" ? true : false));
            $("#font-italic").prop("checked", (props.fontStyle == "italic" ? true : false));
            $("#font-color").val(props.color);

            $("#format-date").val(props.format);
            $("#min-date").datepicker("setDate", props.minDate).val(props.minDate);
            $("#max-date").datepicker("setDate", props.maxDate).val(props.maxDate);
            break;
        default:
            break;
    }
}

function applyProperties() {
    if (!activeFieldObj) return;

    const idField = parseInt(activeFieldObj.idField);

    switch (idField) {
        case TIPO_CAMPO_TEXT:
            var fontColor = $("#font-color").val();
            var fontFamily = $("#font-family").val();
            var fontSize = parseInt($("#font-size").val());
            var fontStyle = $("#font-italic").prop("checked") ? "italic" : "normal";
            var fontWeight = $("#font-bold").prop("checked") ? "bold" : "normal";

            var computedFontSize = fontSize * scale;
            var lineHeight = computedFontSize * FACTOR_HEIGHT_FONT_SIZE;
            var defaultHeight = lineHeight;

            activeFieldObj.container.style.height = defaultHeight + "px";
            activeFieldObj.container.dataset.originHeight = defaultHeight / scale;

            Object.assign(activeFieldObj.properties, {
                color: fontColor,
                fontFamily,
                fontSize,
                fontStyle,
                fontWeight
            });

            Object.assign(activeFieldObj.fieldElement.style, {
                color: fontColor,
                fontFamily,
                fontSize: `${fontSize * scale}px`,
                fontStyle,
                fontWeight
            });

            break;
        case TIPO_CAMPO_SELECT:
            var fontColor = $("#font-color").val();
            var fontFamily = $("#font-family").val();
            var fontSize = parseInt($("#font-size").val());
            var fontStyle = $("#font-italic").prop("checked") ? "italic" : "normal";
            var fontWeight = $("#font-bold").prop("checked") ? "bold" : "normal";

            var computedFontSize = fontSize * scale;
            var lineHeight = computedFontSize * FACTOR_HEIGHT_FONT_SIZE_SELECT;
            var defaultHeight = lineHeight;

            activeFieldObj.container.style.height = defaultHeight + "px";
            activeFieldObj.container.dataset.originHeight = defaultHeight / scale;

            const newOptions = [];
            $("#select-options-container input[type='text']").each((index, input) => {
                newOptions.push({
                    id: index,
                    name: $(input).val()
                });
            });

            Object.assign(activeFieldObj.properties, {
                color: fontColor,
                fontFamily,
                fontSize,
                fontStyle,
                fontWeight,
                options: newOptions
            });

            $(activeFieldObj.fieldElement).empty();
            newOptions.forEach(opt => {
                $("<option>", {
                    value: opt.id,
                    text: opt.name
                }).appendTo(activeFieldObj.fieldElement);
            });

            Object.assign(activeFieldObj.fieldElement.style, {
                color: fontColor,
                fontFamily,
                fontSize: `${fontSize * scale}px`,
                fontStyle,
                fontWeight
            });
            break;
        case TIPO_CAMPO_QR:
            const opacityValue = parseFloat($("#image-opacity").val());
            activeFieldObj.properties.opacity = opacityValue;
            activeFieldObj.fieldElement.style.opacity = opacityValue;
            break;
        case TIPO_CAMPO_TEXT_AREA:
            var fontColor = $("#font-color").val();
            var fontFamily = $("#font-family").val();
            var fontSize = parseInt($("#font-size").val());
            var fontStyle = $("#font-italic").prop("checked") ? "italic" : "normal";
            var fontWeight = $("#font-bold").prop("checked") ? "bold" : "normal";

            Object.assign(activeFieldObj.properties, {
                color: fontColor,
                fontFamily,
                fontSize,
                fontStyle,
                fontWeight
            });

            Object.assign(activeFieldObj.fieldElement.style, {
                color: fontColor,
                fontFamily,
                fontSize: `${fontSize * scale}px`,
                fontStyle,
                fontWeight
            });
            break;
        case TIPO_CAMPO_DATE:
            var fontColor = $("#font-color").val();
            var fontFamily = $("#font-family").val();
            var fontSize = parseInt($("#font-size").val());
            var fontStyle = $("#font-italic").prop("checked") ? "italic" : "normal";
            var fontWeight = $("#font-bold").prop("checked") ? "bold" : "normal";
            var format = $("#format-date").val();
            var minDate = $("#min-date").val();
            var maxDate = $("#max-date").val();

            var computedFontSize = fontSize * scale;
            var lineHeight = computedFontSize * FACTOR_HEIGHT_FONT_SIZE;
            var defaultHeight = lineHeight;

            activeFieldObj.container.style.height = defaultHeight + "px";
            activeFieldObj.container.dataset.originHeight = defaultHeight / scale;

            const currentFormat = activeFieldObj.properties.format;
            const convertedDate = convertDateFormat(activeFieldObj.properties.text, currentFormat, format);

            Object.assign(activeFieldObj.properties, {
                color: fontColor,
                fontFamily,
                fontSize,
                fontStyle,
                fontWeight,
                format,
                minDate,
                maxDate,
                text: convertedDate
            });

            activeFieldObj.fieldElement.value = convertedDate;

            Object.assign(activeFieldObj.fieldElement.style, {
                color: fontColor,
                fontFamily,
                fontSize: `${fontSize * scale}px`,
                fontStyle,
                fontWeight
            });
            break;
        default:
            console.warn("Tipo de campo no reconocido:", idField);
            break;
    }

    $("#field-properties").addClass("hidden");
}

function convertDateFormat(dateStr, fromFormat, toFormat) {
    const delimiter = fromFormat.includes("/") ? "/" : "-";
    const outputDelimiter = toFormat.includes("/") ? "/" : "-";

    let fromParts = fromFormat.split(delimiter);
    let dateParts = dateStr.split(delimiter);

    if (fromParts.length !== dateParts.length) {
        console.error("Error: La fecha no coincide con el formato de entrada.");
        return null;
    }

    let dateMap = {};
    fromParts.forEach((part, index) => {
        dateMap[part] = dateParts[index];
    });

    if (!dateMap["dd"] || !dateMap["mm"] || !dateMap["yy"]) {
        console.error("Error: Formato de fecha inválido.");
        return null;
    }

    let toParts = toFormat.split(outputDelimiter);
    let newDate = toParts.map(part => dateMap[part]).join(outputDelimiter);

    return newDate;
}

guardarCamposBtn.addEventListener('click', async () => {
    if (draggableFields.length === 0) return;

    draggableFields.forEach(fieldObj => {
        updateFieldPDFData(fieldObj);
    });

    const draggableFieldsCopy = draggableFields.map(fieldObj => ({
        ...fieldObj,
    }));

    draggableFieldsCopy.forEach(fieldObj => {
        const container = fieldObj.container;
        const containerObj = {
            className: container.className,
            tabIndex: container.tabIndex,
            width: parseFloat(container.style.width) / scale,
            height: parseFloat(container.style.height) / scale,
            left: parseFloat(container.style.left) / scale,
            top: parseFloat(container.style.top) / scale
        };

        fieldObj.container = containerObj;
    });

    ajaxRequest({
        url: '/edit-template/save-template',
        method: 'POST',
        data: {
            idTemplate: idTemplate,
            fields: JSON.stringify(draggableFieldsCopy)
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
});

function mostrarControlesEdicion(mostrar) {
    const displayValue = mostrar ? "inline-block" : "none";
    prevPageBtn.style.display = displayValue;
    nextPageBtn.style.display = displayValue;
    zoomInBtn.style.display = displayValue;
    zoomOutBtn.style.display = displayValue;
    guardarCamposBtn.style.display = mostrar && draggableFields.length > 0 ? "inline-block" : "none";
    pageNumSpan.parentNode.style.display = displayValue;
}