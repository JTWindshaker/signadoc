// Variables globales
const TIPO_CAMPO_TEXT = 1;
const TIPO_CAMPO_SELECT = 2;
const TIPO_CAMPO_QR = 3;

let pdfDoc = null,
    pageNum = 1,
    pageIsRendering = false,
    pageNumIsPending = null,
    scale = 0.5;
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
const downloadBtn = document.getElementById('download-pdf');
const toggleViewCheckbox = document.getElementById('toggle-view-mode');

// Panel de propiedades
const fieldPropertiesPanel = document.getElementById('field-properties');
const fontFamilySelect = document.getElementById('font-family');
const fontSizeInput = document.getElementById('font-size');
const fontBoldCheckbox = document.getElementById('font-bold');
const fontItalicCheckbox = document.getElementById('font-italic');
const fontColorInput = document.getElementById('font-color');
const applyPropertiesBtn = document.getElementById('apply-properties');

// Array para almacenar campos: cada objeto tendrá { container, fieldElement, pdfData, originalPdfData, page, type, properties }
let draggableFields = [];
let activeFieldObj = null;

// --- Renderizado en modo UNA PÁGINA ---
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

                    if (fieldObj.type === "text" || fieldObj.type === "dropdown") {
                        fieldObj.fieldElement.style.fontSize = (fieldObj.properties.fontSize * scale) + "px";
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

toggleViewCheckbox.addEventListener('change', () => {
    viewAll = toggleViewCheckbox.checked;

    if (viewAll) {
        mostrarControlesEdicion(false);
        renderAllPages();
    } else {
        container.innerHTML = "";
        container.appendChild(singleCanvas);

        draggableFields.forEach(fieldObj => {
            const pdfPageHeight = singleCanvas.height / scale;
            fieldObj.container.style.position = "absolute";
            fieldObj.container.style.display = "block";
            fieldObj.container.style.left = (fieldObj.originalPdfData.pdfX * scale) + "px";
            fieldObj.container.style.top = ((pdfPageHeight - fieldObj.originalPdfData.pdfY - fieldObj.originalPdfData.pdfFieldHeight) * scale) + "px";
            fieldObj.container.style.width = (fieldObj.originalPdfData.pdfFieldWidth * scale) + "px";
            fieldObj.container.style.height = (fieldObj.originalPdfData.pdfFieldHeight * scale) + "px";

            if (fieldObj.type === "text" || fieldObj.type === "dropdown") {
                fieldObj.fieldElement.style.fontSize = (fieldObj.properties.fontSize * scale) + "px";
            }

            container.appendChild(fieldObj.container);
        });

        mostrarControlesEdicion(true);
        renderSinglePage(num = pageNum, isDB = false);
    }
});

document.addEventListener('click', () => {
    draggableFields.forEach(fieldObj => {
        const btnCont = fieldObj.container.querySelector('.field-buttons');

        if (btnCont) {
            btnCont.style.display = "none";
        }
    });
});

const idTemplate = $('#idTemplate').val();

$(document).ready(function () {
    loadFields();
    loadTemplate(idTemplate);
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
                                selectField.style.value = propiedades.value;

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
                                makeResizable(containerDiv, resizeHandle);

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

                                containerDiv.addEventListener("focus", () => {
                                    buttonContainer.style.display = "block";
                                    activeFieldObj = fieldObj;
                                });

                                containerDiv.addEventListener("blur", () => {
                                    buttonContainer.style.display = "none";
                                });

                                containerDiv.addEventListener("click", (e) => {
                                    e.stopPropagation();
                                    buttonContainer.style.display = "block";
                                    activeFieldObj = fieldObj;
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
                                    openSelectPropertiesPanel(fieldObj);
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

                                containerDiv.addEventListener("focus", () => {
                                    buttonContainer.style.display = "block";
                                    activeFieldObj = fieldObj;
                                });

                                containerDiv.addEventListener("blur", () => {
                                    buttonContainer.style.display = "none";
                                });

                                containerDiv.addEventListener("click", (e) => {
                                    e.stopPropagation();
                                    buttonContainer.style.display = "block";
                                    activeFieldObj = fieldObj;
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
                                    openImagePropertiesPanel(fieldObj);
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
            toggleViewCheckbox.checked = false;
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
                    selectField.style.fontSize = propiedades.fontSize + "px";
                    selectField.style.fontStyle = propiedades.fontStyle;
                    selectField.style.fontWeight = propiedades.fontWeight;
                    selectField.style.textDecoration = propiedades.textDecoration;
                    selectField.style.value = propiedades.value;

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
                    makeResizable(containerDiv, resizeHandle);

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
                        }
                    };

                    draggableFields.push(fieldObj);
                    guardarCamposBtn.style.display = "inline-block";

                    containerDiv.addEventListener("focus", () => {
                        buttonContainer.style.display = "block";
                        activeFieldObj = fieldObj;
                    });

                    containerDiv.addEventListener("blur", () => {
                        buttonContainer.style.display = "none";
                    });

                    containerDiv.addEventListener("click", (e) => {
                        e.stopPropagation();
                        buttonContainer.style.display = "block";
                        activeFieldObj = fieldObj;
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
                        openSelectPropertiesPanel(fieldObj);
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

                    containerDiv.addEventListener("focus", () => {
                        buttonContainer.style.display = "block";
                        activeFieldObj = fieldObj;
                    });

                    containerDiv.addEventListener("blur", () => {
                        buttonContainer.style.display = "none";
                    });

                    containerDiv.addEventListener("click", (e) => {
                        e.stopPropagation();
                        buttonContainer.style.display = "block";
                        activeFieldObj = fieldObj;
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
                        openImagePropertiesPanel(fieldObj);
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
                        }
                    };

                    draggableFields.push(fieldObj);
                    guardarCamposBtn.style.display = "inline-block";

                    containerDiv.addEventListener("focus", () => {
                        buttonContainer.style.display = "block";
                        activeFieldObj = fieldObj;
                    });

                    containerDiv.addEventListener("blur", () => {
                        buttonContainer.style.display = "none";
                    });

                    containerDiv.addEventListener("click", (e) => {
                        e.stopPropagation();
                        buttonContainer.style.display = "block";
                        activeFieldObj = fieldObj;
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
                        openSelectPropertiesPanel(fieldObj);
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

                    containerDiv.addEventListener("focus", () => {
                        buttonContainer.style.display = "block";
                        activeFieldObj = fieldObj;
                    });

                    containerDiv.addEventListener("blur", () => {
                        buttonContainer.style.display = "none";
                    });

                    containerDiv.addEventListener("click", (e) => {
                        e.stopPropagation();
                        buttonContainer.style.display = "block";
                        activeFieldObj = fieldObj;
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
                        openImagePropertiesPanel(fieldObj);
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
    if (!pdfDoc || scale >= 1) return;
    scale += 0.1;
    scale = parseFloat(scale.toFixed(1));

    queueRenderPage(pageNum, draggableFields, false);
});

zoomOutBtn.addEventListener('click', () => {
    if (!pdfDoc || scale <= 0.3) return;
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

            if (fieldObj.type === "text" || fieldObj.type === "dropdown") {
                fieldObj.fieldElement.style.fontSize = (fieldObj.properties.fontSize * scale) + "px";
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

function openSelectPropertiesPanel(fieldObj) {
    document.getElementById("add-option").removeEventListener("click", addOptionSelect);
    document.getElementById("field-properties").style.display = "none";
    document.getElementById("image-field-properties").style.display = "none";

    const panel = document.getElementById("select-field-properties");
    panel.style.display = "block";

    document.getElementById("select-font-family").value = fieldObj.properties.fontFamily;
    document.getElementById("select-font-size").value = fieldObj.properties.fontSize;
    document.getElementById("select-font-bold").checked = (fieldObj.properties.fontWeight == "bold" ? true : false);
    document.getElementById("select-font-italic").checked = (fieldObj.properties.fontStyle == "italic" ? true : false);
    document.getElementById("select-font-color").value = fieldObj.properties.color;

    const optionsContainer = document.getElementById("select-options-container");
    optionsContainer.innerHTML = "";

    fieldObj.properties.options.forEach((opt, index) => {
        const optionDiv = document.createElement("div");
        optionDiv.style.marginBottom = "5px";
        const inputOpt = document.createElement("input");
        inputOpt.type = "text";
        inputOpt.value = opt.name;
        inputOpt.dataset.value = opt.id;

        inputOpt.style.width = "70%";
        inputOpt.dataset.index = index;
        const removeBtn = document.createElement("button");
        removeBtn.innerHTML = "🗑️";
        removeBtn.style.marginLeft = "5px";

        removeBtn.addEventListener("click", () => {
            fieldObj.properties.options.splice(index, 1);
            optionDiv.remove();
        });

        optionDiv.appendChild(inputOpt);
        optionDiv.appendChild(removeBtn);
        optionsContainer.appendChild(optionDiv);
    });

    document.getElementById("add-option").addEventListener("click", addOptionSelect);

    document.getElementById("apply-select-properties").addEventListener("click", () => {
        if (!activeFieldObj || activeFieldObj.type !== "dropdown") return;

        activeFieldObj.properties.fontFamily = document.getElementById("select-font-family").value;
        activeFieldObj.properties.fontSize = parseInt(document.getElementById("select-font-size").value);
        activeFieldObj.properties.fontWeight = (document.getElementById("select-font-bold").checked ? "bold" : "normal");
        activeFieldObj.properties.fontStyle = (document.getElementById("select-font-italic").checked ? "italic" : "normal");
        activeFieldObj.properties.color = document.getElementById("select-font-color").value;

        const optionsContainer = document.getElementById("select-options-container");
        const newOptions = [];

        optionsContainer.querySelectorAll("input[type='text']").forEach((input, index) => {
            const option = {
                id: index,
                name: input.value
            };

            newOptions.push(option);
        });

        activeFieldObj.properties.options = newOptions;

        activeFieldObj.fieldElement.innerHTML = "";
        newOptions.forEach(opt => {
            const optionEl = document.createElement("option");
            optionEl.value = opt.id;
            optionEl.textContent = opt.name;
            activeFieldObj.fieldElement.appendChild(optionEl);
        });

        activeFieldObj.fieldElement.style.fontFamily = activeFieldObj.properties.fontFamily;
        activeFieldObj.fieldElement.style.fontSize = (activeFieldObj.properties.fontSize * scale) + "px";
        activeFieldObj.fieldElement.style.fontWeight = activeFieldObj.properties.fontWeight;
        activeFieldObj.fieldElement.style.fontStyle = activeFieldObj.properties.fontStyle;
        activeFieldObj.fieldElement.style.color = activeFieldObj.properties.color;

        document.getElementById("select-field-properties").style.display = "none";
    });
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
    document.getElementById("select-field-properties").style.display = "none";
    document.getElementById("image-field-properties").style.display = "none";
    if (fieldObj.type !== "text") {
        fieldPropertiesPanel.style.display = "none";
        return;
    }

    fieldPropertiesPanel.style.display = "block";
    const props = fieldObj.properties || {
        text: fieldObj.name,
        width: "100%",
        height: "100%",
        border: "none",
        outline: "none",
        textAlign: "left",
        color: "#000000",
        fontFamily: "Helvetica",
        fontSize: 12,
        fontWeight: "normal",
        fontStyle: "normal",
        textDecoration: "auto",
    };

    fontFamilySelect.value = props.fontFamily;
    fontSizeInput.value = props.fontSize;
    fontBoldCheckbox.checked = (props.fontWeight == "bold" ? true : false);
    fontItalicCheckbox.checked = (props.fontStyle == "italic" ? true : false);
    fontColorInput.value = props.color;
}

applyPropertiesBtn.addEventListener('click', () => {
    if (!activeFieldObj || activeFieldObj.type !== "text") return;

    const newProps = {
        text: activeFieldObj.name,
        width: "100%",
        height: "100%",
        border: "none",
        outline: "none",
        textAlign: "left",
        color: fontColorInput.value,
        fontFamily: fontFamilySelect.value,
        fontSize: parseInt(fontSizeInput.value),
        fontWeight: (fontBoldCheckbox.checked ? "bold" : "normal"),
        fontStyle: (fontItalicCheckbox.checked ? "italic" : "normal"),
        textDecoration: "auto",
    };

    activeFieldObj.properties = newProps;
    activeFieldObj.fieldElement.style.fontFamily = newProps.fontFamily;
    activeFieldObj.fieldElement.style.fontSize = (newProps.fontSize * scale) + "px";
    activeFieldObj.fieldElement.style.fontWeight = newProps.fontWeight;
    activeFieldObj.fieldElement.style.fontStyle = newProps.fontStyle;
    activeFieldObj.fieldElement.style.color = newProps.color;
    fieldPropertiesPanel.style.display = "none";
});

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

downloadBtn.addEventListener('click', () => {
    if (!pdfData) return;

    const blob = new Blob([pdfData], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "modificado.pdf";
    a.click();
    URL.revokeObjectURL(url);
});

toggleViewCheckbox.addEventListener('change', () => {
    viewAll = toggleViewCheckbox.checked;

    if (viewAll) {
        mostrarControlesEdicion(false);
        renderAllPages();
    } else {
        container.innerHTML = "";
        container.appendChild(singleCanvas);

        draggableFields.forEach(fieldObj => {
            container.appendChild(fieldObj.container);
        });

        mostrarControlesEdicion(true);
        renderSinglePage(num = pageNum, isDB = false);
    }
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

function openImagePropertiesPanel(fieldObj) {
    document.getElementById("field-properties").style.display = "none";
    document.getElementById("select-field-properties").style.display = "none";
    const panel = document.getElementById("image-field-properties");
    panel.style.display = "block";

    const opacityInput = document.getElementById("image-opacity");
    opacityInput.value = fieldObj.properties.opacity;
    document.getElementById("image-opacity-value").textContent = fieldObj.properties.opacity;
    document.getElementById("image-file").value = "";
}

document.getElementById("apply-image-properties").addEventListener("click", () => {
    if (!activeFieldObj || activeFieldObj.type !== "image") return;

    const opacityValue = document.getElementById("image-opacity").value;
    activeFieldObj.properties.opacity = parseFloat(opacityValue);
    activeFieldObj.fieldElement.style.opacity = opacityValue;

    const fileInput = document.getElementById("image-file");
    if (fileInput.files && fileInput.files[0]) {
        const file = fileInput.files[0];
        const reader = new FileReader();
        reader.onload = function (ev) {
            activeFieldObj.fieldElement.src = ev.target.result;
            activeFieldObj.properties.src = ev.target.result;
            activeFieldObj.fieldElement.style.pointerEvents = "none";
            updateFieldPDFData(activeFieldObj);
            document.getElementById("image-field-properties").style.display = "none";
        };
        reader.readAsDataURL(file);
    } else {
        updateFieldPDFData(activeFieldObj);
        document.getElementById("image-field-properties").style.display = "none";
    }
});