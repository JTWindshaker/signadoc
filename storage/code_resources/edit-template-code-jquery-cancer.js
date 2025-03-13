// ==============================
// Variables globales
// ==============================
let pdfDoc = null,
    pageNum = 1,
    pageIsRendering = false,
    pageNumIsPending = null,
    scale = 1.0;
let pdfData = null;
let viewAll = false;
let renderTask = null;
let allRenderTasks = [];
let currentRenderAllCall = 0;
const idTemplate = $('#idTemplate').val();

// ==============================
// Elementos del DOM
// ==============================
const $container = $('#pdf-container');
const $singleCanvas = $('#pdf-render');
const $pageNumSpan = $('#page-num');
const $pageCountSpan = $('#page-count');

// ==============================
// Controles
// ==============================
const $prevPageBtn = $('#prev-page');
const $nextPageBtn = $('#next-page');
const $zoomInBtn = $('#zoom-in');
const $zoomOutBtn = $('#zoom-out');
const $guardarCamposBtn = $('#guardar-campos');
const $downloadBtn = $('#download-pdf');
const $toggleViewCheckbox = $('#toggle-view-mode');

// ==============================
// Panel de propiedades
// ==============================
const $fieldPropertiesPanel = $('#field-properties');
const $fontFamilySelect = $('#font-family');
const $fontSizeInput = $('#font-size');
const $fontBoldCheckbox = $('#font-bold');
const $fontItalicCheckbox = $('#font-italic');
const $fontColorInput = $('#font-color');
const $applyPropertiesBtn = $('#apply-properties');

// ==============================
// Array para almacenar campos
// Cada objeto tendrá la estructura: 
// { container, fieldElement, pdfData, page, type, properties }
// ==============================
let draggableFields = [];
let activeFieldObj = null;

$(document).ready(function () {
    loadFields();
    loadTemplate(idTemplate);
});

// ==============================
// Renderizado en modo UNA PÁGINA
// ==============================
const renderSinglePage = (num) => {
    if (!pdfDoc) return;

    pageIsRendering = true;

    pdfDoc.getPage(num).then(page => {
        const viewport = page.getViewport({ scale });

        // Ajustar dimensiones del canvas y contenedor
        $singleCanvas.height(viewport.height);
        $singleCanvas.width(viewport.width);
        $container.css({
            width: $singleCanvas.width + "px",
            height: $singleCanvas.height + "px"
        });

        const renderCtx = {
            canvasContext: $singleCanvas[0].getContext('2d'),
            viewport: viewport
        };

        // Si ya existe una renderTask, la cancelamos
        if (renderTask) {
            renderTask.cancel();
        }

        renderTask = page.render(renderCtx);

        renderTask.promise.then(() => {
            pageIsRendering = false;

            // Si hay una página pendiente por renderizar, la procesamos
            if (pageNumIsPending !== null) {
                renderSinglePage(pageNumIsPending);
                pageNumIsPending = null;
            }

            updateDraggableFields();
        }).catch((err) => {
            // Si el error es por cancelación de renderizado, lo ignoramos
            if (err.name !== "RenderingCancelledException") {
                console.error("Error al renderizar la página:", err);
            }
        });

        $pageNumSpan.text(num);
    }).catch(err => {
        console.error("Error al obtener la página:", err);
    });
};

// ==================================
// Cola de renderizado de páginas
// Si una página ya se está renderizando, la dejamos pendiente
// ==================================
const queueRenderPage = (num) => {
    if (pageIsRendering) {
        pageNumIsPending = num;
    } else {
        renderSinglePage(num);
    }
};

// ==================================
// Renderizado diferido (lazy) de una página
// ==================================
const renderPageLazy = (pageNumber, $pageContainer) => {
    // Muestra un indicador de carga
    $pageContainer.html("<div class='loading'>Cargando...</div>");

    pdfDoc.getPage(pageNumber).then(page => {
        const viewport = page.getViewport({ scale });

        // Creamos un canvas para la página
        const $canvas = $("<canvas>").css({
            display: "block",
            width: viewport.width + "px",
            height: viewport.height + "px"
        })[0]; // Accedemos al elemento nativo

        $canvas.width = viewport.width;
        $canvas.height = viewport.height;

        // Limpiamos el contenedor y agregamos el canvas
        $pageContainer.empty().append($canvas);

        // Configuración del contexto de renderizado
        const renderCtx = {
            canvasContext: $canvas.getContext("2d"),
            viewport: viewport
        };

        return page.render(renderCtx).promise.then(() => {
            // Una vez renderizada la página, reubicamos los campos correspondientes
            draggableFields.forEach(fieldObj => {
                if (fieldObj.originalPage === pageNumber) {
                    const pdfPageHeight = $canvas.height / scale;
                    $(fieldObj.container).css({
                        position: "absolute",
                        display: "block",
                        left: (fieldObj.pdfData.pdfX * scale) + "px",
                        top: ((pdfPageHeight - fieldObj.pdfData.pdfY - fieldObj.pdfData.pdfFieldHeight) * scale) + "px",
                        width: (fieldObj.pdfData.pdfFieldWidth * scale) + "px",
                        height: (fieldObj.pdfData.pdfFieldHeight * scale) + "px"
                    });

                    // Agregamos el campo al contenedor de la página si aún no está dentro
                    if (!$.contains($pageContainer[0], fieldObj.container)) {
                        $pageContainer.append(fieldObj.container);
                    }
                }
            });
        });
    }).catch(err => {
        console.error("Error al renderizar la página " + pageNumber, err);
        $pageContainer.html("<div class='error'>Error al cargar la página</div>");
    });
};

// ==================================
// Intersection Observer para carga diferida (lazy loading)
// ==================================
const createLazyObserver = () => {
    const options = {
        root: $container[0], // Contenedor principal donde se renderizan las páginas
        rootMargin: "200px", // Precarga cuando la página esté a 200px del viewport
        threshold: 0.1
    };

    return new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const pageNumber = parseInt($(entry.target).data("pageNumber"));

                // Evitamos renderizar la misma página dos veces
                if (!$(entry.target).data("rendered")) {
                    renderPageLazy(pageNumber, $(entry.target));
                    $(entry.target).data("rendered", true);
                }
            }
        });
    }, options);
};

// ==================================
// Renderizado en modo TODAS LAS PÁGINAS
// ==================================
const renderAllPages = () => {
    if (!pdfDoc) return;
    $container.empty(); // Limpia el contenedor

    // Creamos el IntersectionObserver para carga diferida
    const observer = createLazyObserver();

    for (let i = 1; i <= pdfDoc.numPages; i++) {
        // Creamos el contenedor de la página con jQuery
        const $pageContainer = $("<div>", {
            css: {
                position: "relative",
                display: "inline-block",
                border: "1px solid #000",
                marginBottom: "20px",
                minHeight: "100px" // Altura mínima para mostrar el indicador de carga
            },
            "data-page-number": i, // Guardamos el número de página como atributo de datos
            html: "<div class='loading'>Cargando...</div>" // Indicador de carga inicial
        });

        $container.append($pageContainer);
        observer.observe($pageContainer[0]); // Observamos el contenedor para cargarlo cuando entre en el viewport
    }
};

// ==================================
// Cambio entre vistas (una página / todas las páginas)
// ==================================
$toggleViewCheckbox.on("change", () => {
    viewAll = $toggleViewCheckbox.prop("checked");

    if (viewAll) {
        mostrarControlesEdicion(false); // Oculta los controles de edición
        renderAllPages(); // Renderiza todas las páginas
    } else {
        // Volver a la vista de una sola página
        $container.empty().append($singleCanvas); // Limpia el contenedor y añade el canvas único

        // Reinsertar los campos interactivos en el contenedor principal
        draggableFields.forEach(fieldObj => {
            const pdfPageHeight = $singleCanvas.height() / scale;

            // Actualizamos la posición y tamaño del campo en base al canvas único
            $(fieldObj.container).css({
                position: "absolute",
                display: "block",
                left: (fieldObj.pdfData.pdfX * scale) + "px",
                top: ((pdfPageHeight - fieldObj.pdfData.pdfY - fieldObj.pdfData.pdfFieldHeight) * scale) + "px",
                width: (fieldObj.pdfData.pdfFieldWidth * scale) + "px",
                height: (fieldObj.pdfData.pdfFieldHeight * scale) + "px"
            });

            $container.append(fieldObj.container);
        });

        mostrarControlesEdicion(true); // Vuelve a mostrar los controles de edición
        renderSinglePage(pageNum); // Renderiza la página actual
    }
});

// =========================================================
// Oculta todos los botones de eliminar y configurar al hacer clic fuera de cualquier campo
// =========================================================
$(document).on("click", () => {
    draggableFields.forEach(fieldObj => {
        const $btnCont = $(fieldObj.container).find(".field-buttons");
        $btnCont.hide();
    });
});

// =========================================================
// Carga un PDF y lo renderiza en la vista
// =========================================================
async function loadPDF(pdfUrl, annotations) {
    pdfjsLib.getDocument(pdfUrl).promise.then(pdfDoc_ => {
        pdfDoc = pdfDoc_;
        $pageCountSpan.text(pdfDoc.numPages);
        viewAll = false;
        $toggleViewCheckbox.prop("checked", false);
        mostrarControlesEdicion(true);
        renderSinglePage(pageNum);
    }).catch(err => {
        console.error("Error al cargar el PDF:", err);
    });
}

// =========================================================
// Navegación entre páginas y zoom
// =========================================================
$prevPageBtn.on("click", () => {
    if (!pdfDoc || pageNum <= 1) return;
    pageNum--;
    queueRenderPage(pageNum);
});

$nextPageBtn.on("click", () => {
    if (!pdfDoc || pageNum >= pdfDoc.numPages) return;
    pageNum++;
    queueRenderPage(pageNum);
});

$zoomInBtn.on("click", () => {
    if (!pdfDoc) return;
    scale += 0.1;
    queueRenderPage(pageNum);
});

$zoomOutBtn.on("click", () => {
    if (!pdfDoc || scale <= 0.2) return;
    scale -= 0.1;
    queueRenderPage(pageNum);
});

// =========================================================
// Actualizar posición y tamaño de los campos (y escalar la fuente)
// =========================================================
function updateFieldPDFData(fieldObj) {
    const $containerEl = $(fieldObj.container);
    const newLeft = parseFloat($containerEl.css("left"));
    const newTop = parseFloat($containerEl.css("top"));
    const fieldWidth = $containerEl.outerWidth();
    const fieldHeight = $containerEl.outerHeight();

    let pdfPageWidth, pdfPageHeight, canvasHeight;

    if (viewAll) {
        // En la vista de todas las páginas, el contenedor padre es el pageContainer
        const $parentContainer = $containerEl.parent();
        const $canvasEl = $parentContainer.find("canvas");
        pdfPageWidth = $canvasEl[0].width / scale;
        pdfPageHeight = $canvasEl[0].height / scale;
        canvasHeight = $canvasEl[0].height;
    } else {
        pdfPageWidth = singleCanvas.width / scale;
        pdfPageHeight = singleCanvas.height / scale;
        canvasHeight = singleCanvas.height;
    }

    fieldObj.pdfData = {
        pdfX: newLeft / scale,
        pdfFieldWidth: fieldWidth / scale,
        pdfFieldHeight: fieldHeight / scale,
        pdfPageWidth: pdfPageWidth,
        pdfPageHeight: pdfPageHeight,
        pdfY: (canvasHeight - newTop - fieldHeight) / scale
    };
}

// =========================================================
// Actualizar los campos arrastrables al cambiar de vista
// =========================================================
function updateDraggableFields() {
    draggableFields.forEach(fieldObj => {
        const $container = $(fieldObj.container);

        if (!viewAll && fieldObj.page === pageNum) {
            $container.show();
            const pdfPageHeight = singleCanvas.height / scale;
            $container.css({
                left: (fieldObj.pdfData.pdfX * scale) + "px",
                top: ((pdfPageHeight - fieldObj.pdfData.pdfY - fieldObj.pdfData.pdfFieldHeight) * scale) + "px",
                width: (fieldObj.pdfData.pdfFieldWidth * scale) + "px",
                height: (fieldObj.pdfData.pdfFieldHeight * scale) + "px"
            });
        } else {
            $container.hide();
        }
    });
}

// =========================================================
// Actualizar la información del campo basado en un elemento
// =========================================================
function updateFieldPDFDataForElement(el) {
    draggableFields.forEach(fieldObj => {
        if (fieldObj.container === el) {
            updateFieldPDFData(fieldObj);
        }
    });
}

// =========================================================
// Hacer los campos arrastrables
// =========================================================
function makeDraggable($el) {
    let startX = 0,
        startY = 0,
        dragging = false,
        offsetX = 0,
        offsetY = 0;

    function mouseDownHandler(e) {
        startX = e.clientX;
        startY = e.clientY;
        offsetX = e.clientX - $el[0].getBoundingClientRect().left;
        offsetY = e.clientY - $el[0].getBoundingClientRect().top;
        dragging = false;
        $(window).on("mousemove", mouseMoveHandler);
        $(window).on("mouseup", mouseUpHandler);
    }

    function mouseMoveHandler(e) {
        const dx = e.clientX - startX,
            dy = e.clientY - startY;

        if (!dragging && Math.sqrt(dx * dx + dy * dy) > 5) {
            dragging = true;
            e.preventDefault();
        }

        if (dragging) {
            let boundingRect;
            if (viewAll && $el.parent().length) {
                boundingRect = $el.parent()[0].getBoundingClientRect();
            } else {
                boundingRect = $("#container")[0].getBoundingClientRect();
            }

            let newLeft = e.clientX - boundingRect.left - offsetX;
            let newTop = e.clientY - boundingRect.top - offsetY;

            if (newLeft < 0) newLeft = 0;
            if (newTop < 0) newTop = 0;

            let limitWidth = viewAll ? $el.parent().width() : $("#container").width();
            let limitHeight = viewAll ? $el.parent().height() : $("#container").height();

            if (newLeft + $el.outerWidth() > limitWidth) newLeft = limitWidth - $el.outerWidth();
            if (newTop + $el.outerHeight() > limitHeight) newTop = limitHeight - $el.outerHeight();

            $el.css({
                left: newLeft + "px",
                top: newTop + "px"
            });
        }
    }

    function mouseUpHandler() {
        $(window).off("mousemove", mouseMoveHandler);
        $(window).off("mouseup", mouseUpHandler);
        if (dragging) {
            updateFieldPDFDataForElement($el[0]);
        }
    }

    $el.on("mousedown", mouseDownHandler);
}

function makeResizable($containerEl, $handle) {
    let startX, startY, startWidth, startHeight;

    $handle.on("mousedown", function (e) {
        e.stopPropagation(); // Evita iniciar el arrastre del contenedor
        startX = e.clientX;
        startY = e.clientY;
        startWidth = $containerEl.outerWidth();
        startHeight = $containerEl.outerHeight();

        $(window).on("mousemove", resizeMouseMove);
        $(window).on("mouseup", resizeMouseUp);
    });

    function resizeMouseMove(e) {
        let newWidth = startWidth + (e.clientX - startX);
        let newHeight = startHeight + (e.clientY - startY);
        newWidth = Math.max(newWidth, 50); // tamaño mínimo
        newHeight = Math.max(newHeight, 20); // tamaño mínimo

        $containerEl.css({
            width: newWidth + "px",
            height: newHeight + "px"
        });
    }

    function resizeMouseUp() {
        $(window).off("mousemove", resizeMouseMove);
        $(window).off("mouseup", resizeMouseUp);
        updateFieldPDFDataForElement($containerEl[0]);
    }
}


// // --- Agregar campo de texto (con contenedor redimensionable) ---
// addFieldBtn.addEventListener('click', () => {
//     if (!pdfDoc) {
//         alert("Primero carga un PDF.");
//         return;
//     }
//     const containerDiv = document.createElement("div");
//     containerDiv.className = "draggable";
//     containerDiv.tabIndex = 0; // para que pueda recibir focus
//     const defaultWidth = 150,
//         defaultHeight = 20;
//     containerDiv.style.width = defaultWidth + "px";
//     containerDiv.style.height = defaultHeight + "px";
//     const initialLeft = (singleCanvas.width - defaultWidth) / 2;
//     const initialTop = (singleCanvas.height - defaultHeight) / 2;
//     containerDiv.style.left = initialLeft + "px";
//     containerDiv.style.top = initialTop + "px";

//     // Campo de entrada de texto
//     const inputField = document.createElement("input");
//     inputField.type = "text";
//     inputField.value = "Ingrese texto";
//     inputField.style.width = "100%";
//     inputField.style.height = "100%";
//     inputField.style.border = "none";
//     inputField.style.outline = "none";
//     containerDiv.appendChild(inputField);

//     // Handle para redimensionar
//     const resizeHandle = document.createElement("div");
//     resizeHandle.className = "resize-handle";
//     containerDiv.appendChild(resizeHandle);

//     // Contenedor de botones (eliminar y settings)
//     const buttonContainer = document.createElement("div");
//     buttonContainer.className = "field-buttons";
//     // Botón para propiedades (settings)
//     const buttonSettings = document.createElement("button");
//     buttonSettings.innerHTML = "⚙️"; // icono de gear
//     buttonSettings.title = "Propiedades";
//     // Botón para eliminar (caneca)
//     const buttonDelete = document.createElement("button");
//     buttonDelete.innerHTML = "🗑️"; // icono de caneca
//     buttonDelete.title = "Eliminar campo";
//     buttonContainer.appendChild(buttonSettings);
//     buttonContainer.appendChild(buttonDelete);
//     containerDiv.appendChild(buttonContainer);

//     container.appendChild(containerDiv);
//     makeDraggable(containerDiv);
//     makeResizable(containerDiv, resizeHandle);

//     const pdfPageWidth = singleCanvas.width / scale;
//     const pdfPageHeight = singleCanvas.height / scale;
//     const fieldPDFData = {
//         pdfX: initialLeft / scale,
//         pdfFieldWidth: defaultWidth / scale,
//         pdfFieldHeight: defaultHeight / scale,
//         pdfPageWidth: pdfPageWidth,
//         pdfPageHeight: pdfPageHeight,
//         pdfY: (singleCanvas.height - initialTop - defaultHeight) / scale
//     };
//     const fieldObj = {
//         container: containerDiv,
//         fieldElement: inputField,
//         pdfData: fieldPDFData,
//         page: pageNum,
//         originalPage: pageNum,
//         type: "text",
//         properties: {
//             fontFamily: "Helvetica",
//             fontSize: 12,
//             bold: false,
//             italic: false,
//             color: "#000000"
//         }
//     };
//     draggableFields.push(fieldObj);
//     guardarCamposBtn.style.display = "inline-block";

//     // Al recibir focus, mostramos los botones pero no abrimos el panel de propiedades
//     containerDiv.addEventListener("click", (e) => {
//         e.stopPropagation();
//         hideAllButtonContainersExcept(containerDiv);
//         const buttonContainer = containerDiv.querySelector('.field-buttons');
//         if (buttonContainer) {
//             buttonContainer.style.display = "block";
//         }
//         activeFieldObj = fieldObj;
//     });

//     containerDiv.addEventListener("focus", () => {
//         hideAllButtonContainersExcept(containerDiv);
//         const buttonContainer = containerDiv.querySelector('.field-buttons');
//         if (buttonContainer) {
//             buttonContainer.style.display = "block";
//         }
//         activeFieldObj = fieldObj;
//     });

//     containerDiv.addEventListener("blur", () => {
//         buttonContainer.style.display = "none";
//     });
//     // Si se hace click en el contenedor, solo mostramos los botones (sin abrir el panel)
//     containerDiv.addEventListener("click", (e) => {
//         e.stopPropagation();
//         buttonContainer.style.display = "block";
//         activeFieldObj = fieldObj;
//     });

//     // Evento para eliminar el campo
//     buttonDelete.addEventListener("click", (e) => {
//         e.stopPropagation();
//         containerDiv.remove();
//         draggableFields = draggableFields.filter(item => item.container !== containerDiv);
//     });

//     // Evento para abrir el panel de propiedades
//     buttonSettings.addEventListener("click", (e) => {
//         e.stopPropagation();
//         activeFieldObj = fieldObj;
//         showPropertiesPanel(fieldObj);
//     });
// });


// // --- Agregar campo de lista desplegable (con contenedor redimensionable) ---
// addDropdownBtn.addEventListener('click', () => {
//     if (!pdfDoc) {
//         alert("Primero carga un PDF.");
//         return;
//     }
//     const containerDiv = document.createElement("div");
//     containerDiv.className = "draggable";
//     const defaultWidth = 150,
//         defaultHeight = 20;
//     containerDiv.style.width = defaultWidth + "px";
//     containerDiv.style.height = defaultHeight + "px";
//     const initialLeft = (singleCanvas.width - defaultWidth) / 2;
//     const initialTop = (singleCanvas.height - defaultHeight) / 2;
//     containerDiv.style.left = initialLeft + "px";
//     containerDiv.style.top = initialTop + "px";

//     // Campo select
//     const selectField = document.createElement("select");
//     // Opciones por defecto
//     selectField.innerHTML = `
// <option value="Prueba 1">Prueba 1</option>
// <option value="Prueba 2">Prueba 2</option>
// <option value="Prueba 3">Prueba 3</option>
// `;
//     selectField.style.width = "100%";
//     selectField.style.height = "100%";
//     containerDiv.appendChild(selectField);

//     // Handle para redimensionar
//     const resizeHandle = document.createElement("div");
//     resizeHandle.className = "resize-handle";
//     containerDiv.appendChild(resizeHandle);

//     // Contenedor de botones (configuración y eliminar)
//     const buttonContainer = document.createElement("div");
//     buttonContainer.className = "field-buttons";
//     // Se ubicará en la esquina superior izquierda, fuera del campo (como vimos antes)
//     const buttonSettings = document.createElement("button");
//     buttonSettings.innerHTML = "⚙️";
//     buttonSettings.title = "Propiedades";
//     const buttonDelete = document.createElement("button");
//     buttonDelete.innerHTML = "🗑️";
//     buttonDelete.title = "Eliminar campo";
//     buttonContainer.appendChild(buttonSettings);
//     buttonContainer.appendChild(buttonDelete);
//     containerDiv.appendChild(buttonContainer);

//     container.appendChild(containerDiv);
//     makeDraggable(containerDiv);
//     makeResizable(containerDiv, resizeHandle);

//     const pdfPageWidth = singleCanvas.width / scale;
//     const pdfPageHeight = singleCanvas.height / scale;
//     const fieldPDFData = {
//         pdfX: initialLeft / scale,
//         pdfFieldWidth: defaultWidth / scale,
//         pdfFieldHeight: defaultHeight / scale,
//         pdfPageWidth: pdfPageWidth,
//         pdfPageHeight: pdfPageHeight,
//         pdfY: (singleCanvas.height - initialTop - defaultHeight) / scale
//     };

//     // Creamos el objeto del campo, agregando la propiedad 'properties'
//     // 'options' contendrá un arreglo con los textos de cada opción.
//     const fieldObj = {
//         container: containerDiv,
//         fieldElement: selectField,
//         pdfData: fieldPDFData,
//         page: pageNum,
//         originalPage: pageNum,
//         type: "dropdown",
//         properties: {
//             fontFamily: "Helvetica",
//             fontSize: 12,
//             bold: false,
//             italic: false,
//             color: "#000000",
//             options: ["Prueba 1", "Prueba 2", "Prueba 3"]
//         }
//     };

//     draggableFields.push(fieldObj);
//     guardarCamposBtn.style.display = "inline-block";

//     // Mostrar botones al recibir focus o click
//     containerDiv.addEventListener("focus", () => {
//         buttonContainer.style.display = "block";
//         activeFieldObj = fieldObj;
//     });
//     containerDiv.addEventListener("blur", () => {
//         buttonContainer.style.display = "none";
//     });
//     containerDiv.addEventListener("click", (e) => {
//         e.stopPropagation();
//         buttonContainer.style.display = "block";
//         activeFieldObj = fieldObj;
//     });

//     buttonDelete.addEventListener("click", (e) => {
//         e.stopPropagation();
//         containerDiv.remove();
//         draggableFields = draggableFields.filter(item => item.container !== containerDiv);
//     });

//     // Ahora, el botón de configuración abre el panel de propiedades para select
//     buttonSettings.addEventListener("click", (e) => {
//         e.stopPropagation();
//         activeFieldObj = fieldObj;
//         openSelectPropertiesPanel(fieldObj);
//     });
// });


// // --- Agregar campo de imagen (con contenedor redimensionable) ---
// addImageBtn.addEventListener('click', () => {
//     if (!pdfDoc) {
//         alert("Primero carga un PDF.");
//         return;
//     }
//     const containerDiv = document.createElement("div");
//     containerDiv.className = "draggable";
//     const defaultWidth = 150,
//         defaultHeight = 150; // tamaño por defecto para imagen
//     containerDiv.style.width = defaultWidth + "px";
//     containerDiv.style.height = defaultHeight + "px";
//     const initialLeft = (singleCanvas.width - defaultWidth) / 2;
//     const initialTop = (singleCanvas.height - defaultHeight) / 2;
//     containerDiv.style.left = initialLeft + "px";
//     containerDiv.style.top = initialTop + "px";

//     // Campo de imagen
//     const imgField = document.createElement("img");
//     imgField.src = ""; // inicialmente sin imagen
//     imgField.alt = "Haga clic para seleccionar imagen";
//     imgField.style.width = "100%";
//     imgField.style.height = "100%";
//     imgField.style.objectFit = "contain";
//     imgField.style.background = "#eee";
//     containerDiv.appendChild(imgField);

//     // Handle para redimensionar
//     const resizeHandle = document.createElement("div");
//     resizeHandle.className = "resize-handle";
//     containerDiv.appendChild(resizeHandle);



//     container.appendChild(containerDiv);
//     makeDraggable(containerDiv);
//     makeResizable(containerDiv, resizeHandle);

//     // Al hacer clic en la imagen se abre un selector para elegir la imagen
//     imgField.addEventListener('click', (e) => {
//         e.stopPropagation();
//         const fileInput = document.createElement("input");
//         fileInput.type = "file";
//         fileInput.accept = "image/png, image/jpeg";
//         fileInput.style.display = "none";
//         fileInput.addEventListener('change', (event) => {
//             const file = event.target.files[0];
//             if (file) {
//                 const reader = new FileReader();
//                 reader.onload = function (ev) {
//                     imgField.src = ev.target.result;
//                 };
//                 reader.readAsDataURL(file);
//             }
//         });
//         container.appendChild(fileInput);
//         fileInput.click();
//         fileInput.remove();
//     });

//     const pdfPageWidth = singleCanvas.width / scale;
//     const pdfPageHeight = singleCanvas.height / scale;
//     const fieldPDFData = {
//         pdfX: initialLeft / scale,
//         pdfFieldWidth: defaultWidth / scale,
//         pdfFieldHeight: defaultHeight / scale,
//         pdfPageWidth: pdfPageWidth,
//         pdfPageHeight: pdfPageHeight,
//         pdfY: (singleCanvas.height - initialTop - defaultHeight) / scale
//     };
//     draggableFields.push({
//         container: containerDiv,
//         fieldElement: imgField,
//         pdfData: fieldPDFData,
//         page: pageNum,
//         originalPage: pageNum,
//         type: "image"
//     });
//     guardarCamposBtn.style.display = "inline-block";
// });

// =========================================================
// Panel de propiedades para campos de selección
// =========================================================
function openSelectPropertiesPanel(fieldObj) {
    // Ocultamos el panel de texto y mostramos el de selección
    $("#field-properties").hide();
    $("#select-field-properties").show();

    // Rellenamos los valores de estilo
    $("#select-font-family").val(fieldObj.properties.fontFamily);
    $("#select-font-size").val(fieldObj.properties.fontSize);
    $("#select-font-bold").prop("checked", fieldObj.properties.bold);
    $("#select-font-italic").prop("checked", fieldObj.properties.italic);
    $("#select-font-color").val(fieldObj.properties.color);

    // Limpiar opciones anteriores y añadir nuevas
    const $optionsContainer = $("#select-options-container").empty();

    fieldObj.properties.options.forEach((opt, index) => {
        const $optionDiv = $("<div>").css("margin-bottom", "5px");
        const $inputOpt = $("<input>").attr({ type: "text", value: opt }).css("width", "70%").data("index", index);
        const $removeBtn = $("<button>").html("🗑️").css("margin-left", "5px").on("click", function () {
            fieldObj.properties.options.splice(index, 1);
            openSelectPropertiesPanel(fieldObj); // Recargar opciones
        });

        $optionDiv.append($inputOpt, $removeBtn);
        $optionsContainer.append($optionDiv);
    });

    // Agregar nueva opción
    $("#add-option").off("click").on("click", function () {
        const $optionDiv = $("<div>").css("margin-bottom", "5px");
        const $inputOpt = $("<input>").attr("type", "text").val("");
        const $removeBtn = $("<button>").html("🗑️").css("margin-left", "5px").on("click", function () {
            $optionDiv.remove();
        });

        $optionDiv.append($inputOpt, $removeBtn);
        $optionsContainer.append($optionDiv);
    });

    // Aplicar propiedades al campo select
    $("#apply-select-properties").off("click").on("click", function () {
        if (!activeFieldObj || activeFieldObj.type !== "dropdown") return;

        // Actualizar propiedades de estilo
        activeFieldObj.properties = {
            fontFamily: $("#select-font-family").val(),
            fontSize: parseInt($("#select-font-size").val()),
            bold: $("#select-font-bold").prop("checked"),
            italic: $("#select-font-italic").prop("checked"),
            color: $("#select-font-color").val(),
            options: $optionsContainer.find("input[type='text']").map(function () {
                return $(this).val();
            }).get()
        };

        // Actualizar contenido del select
        const $fieldElement = $(activeFieldObj.fieldElement).empty();
        activeFieldObj.properties.options.forEach(opt => {
            $("<option>").val(opt).text(opt).appendTo($fieldElement);
        });

        // Aplicar estilos
        $fieldElement.css({
            fontFamily: activeFieldObj.properties.fontFamily,
            fontSize: activeFieldObj.properties.fontSize + "px",
            fontWeight: activeFieldObj.properties.bold ? "bold" : "normal",
            fontStyle: activeFieldObj.properties.italic ? "italic" : "normal",
            color: activeFieldObj.properties.color
        });

        $("#select-field-properties").hide();
    });
}

// =========================================================
// Ocultar botones de eliminar y configurar
// =========================================================
function hideAllButtonContainersExcept(activeContainer) {
    draggableFields.forEach(fieldObj => {
        if (fieldObj.container !== activeContainer) {
            $(fieldObj.container).find(".field-buttons").hide();
        }
    });
}

// =========================================================
// Panel de propiedades para campos de texto
// =========================================================
function showPropertiesPanel(fieldObj) {
    if (fieldObj.type !== "text") {
        $("#field-properties").hide();
        return;
    }
    $("#field-properties").show();

    const props = fieldObj.properties || {
        fontFamily: "Helvetica",
        fontSize: 12,
        bold: false,
        italic: false,
        color: "#000000"
    };

    $("#font-family").val(props.fontFamily);
    $("#font-size").val(props.fontSize);
    $("#font-bold").prop("checked", props.bold);
    $("#font-italic").prop("checked", props.italic);
    $("#font-color").val(props.color);
}

// =========================================================
// Aplicar cambios en propiedades de texto
// =========================================================
$("#apply-properties").off("click").on("click", function () {
    if (!activeFieldObj || activeFieldObj.type !== "text") return;

    const newProps = {
        fontFamily: $("#font-family").val(),
        fontSize: parseInt($("#font-size").val()),
        bold: $("#font-bold").prop("checked"),
        italic: $("#font-italic").prop("checked"),
        color: $("#font-color").val()
    };

    activeFieldObj.properties = newProps;
    $(activeFieldObj.fieldElement).css({
        fontFamily: newProps.fontFamily,
        fontSize: newProps.fontSize + "px",
        fontWeight: newProps.bold ? "bold" : "normal",
        fontStyle: newProps.italic ? "italic" : "normal",
        color: newProps.color
    });

    $("#field-properties").hide();
});

// =========================================================
// Función para obtener la fuente estándar según propiedades
// =========================================================
function getStandardFont(props) {
    if (props.fontFamily === "Helvetica") {
        if (props.bold && props.italic) return PDFLib.StandardFonts.HelveticaBoldOblique;
        if (props.bold) return PDFLib.StandardFonts.HelveticaBold;
        if (props.italic) return PDFLib.StandardFonts.HelveticaOblique;
        return PDFLib.StandardFonts.Helvetica;
    }
    if (props.fontFamily === "TimesRoman") {
        if (props.bold && props.italic) return PDFLib.StandardFonts.TimesBoldItalic;
        if (props.bold) return PDFLib.StandardFonts.TimesBold;
        if (props.italic) return PDFLib.StandardFonts.TimesItalic;
        return PDFLib.StandardFonts.TimesRoman;
    }
    if (props.fontFamily === "Courier") {
        if (props.bold && props.italic) return PDFLib.StandardFonts.CourierBoldOblique;
        if (props.bold) return PDFLib.StandardFonts.CourierBold;
        if (props.italic) return PDFLib.StandardFonts.CourierOblique;
        return PDFLib.StandardFonts.Courier;
    }
    return PDFLib.StandardFonts.Helvetica;
}

// =========================================================
// Utilidad: Convertir dataURL a Uint8Array
// =========================================================
function dataURLtoUint8Array(dataURL) {
    const base64 = dataURL.split(',')[1];
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}

// =========================================================
// Guardar y aplanar el PDF (insertando texto, selección e imagen)
// =========================================================
$guardarCamposBtn.on('click', async function () {
    if (draggableFields.length === 0) return;

    try {
        $.each(draggableFields, function (index, fieldObj) {
            updateFieldPDFData(fieldObj);
        });
        const pdfDocLib = await PDFLib.PDFDocument.load(pdfData);
        const pages = pdfDocLib.getPages();

        $.each(draggableFields, async function (index, fieldObj) {
            const targetPage = pages[fieldObj.page - 1];
            const { pdfX, pdfY, pdfFieldWidth, pdfFieldHeight } = fieldObj.pdfData;

            if (fieldObj.type === "text") {
                let font, fontSize = 12, color = PDFLib.rgb(0, 0, 0);
                if (fieldObj.properties) {
                    font = await pdfDocLib.embedFont(getStandardFont(fieldObj.properties));
                    fontSize = fieldObj.properties.fontSize || 12;
                    const [r, g, b] = fieldObj.properties.color.match(/#(..)(..)(..)/).slice(1).map(v => parseInt(v, 16) / 255);
                    color = PDFLib.rgb(r, g, b);
                } else {
                    font = await pdfDocLib.embedFont(PDFLib.StandardFonts.Helvetica);
                }
                targetPage.drawText($(fieldObj.fieldElement).val(), { x: pdfX, y: pdfY, size: fontSize, font, color });
            }
            else if (fieldObj.type === "dropdown") {
                targetPage.drawText($(fieldObj.fieldElement).val(), { x: pdfX, y: pdfY, size: 12, font: await pdfDocLib.embedFont(PDFLib.StandardFonts.Helvetica), color: PDFLib.rgb(0, 0, 0) });
            }
            else if (fieldObj.type === "image") {
                const imageDataUrl = $(fieldObj.fieldElement).attr('src');
                if (imageDataUrl) {
                    const imageBytes = dataURLtoUint8Array(imageDataUrl);
                    let embeddedImage = imageDataUrl.startsWith("data:image/png") ? await pdfDocLib.embedPng(imageBytes) : await pdfDocLib.embedJpg(imageBytes);
                    targetPage.drawImage(embeddedImage, { x: pdfX, y: pdfY, width: pdfFieldWidth, height: pdfFieldHeight });
                }
            }
        });

        pdfData = await pdfDocLib.save();
        pdfjsLib.getDocument({ data: pdfData }).promise.then(pdfDoc_ => {
            pdfDoc = pdfDoc_;
            $pageCountSpan.text(pdfDoc.numPages);
            pageNum = Math.min(pageNum, pdfDoc.numPages);
            renderSinglePage(pageNum);

            $.each(draggableFields, function (index, fieldObj) {
                $(fieldObj.container).remove();
            });

            draggableFields = [];
            $guardarCamposBtn.hide();
            $downloadBtn.show();
        }).catch(err => console.error("Error al recargar el PDF modificado:", err));
    } catch (err) {
        console.error("Error al guardar los campos:", err);
    }
});

// =========================================================
// Botón de descarga del PDF
// =========================================================
$downloadBtn.on('click', function () {
    if (!pdfData) return;
    const blob = new Blob([pdfData], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    $('<a>').attr({ href: url, download: "modificado.pdf" }).appendTo('body').get(0).click();
    URL.revokeObjectURL(url);
});

// =========================================================
// Modo de visualización
// =========================================================
$toggleViewCheckbox.on('change', function () {
    viewAll = this.checked;
    if (viewAll) {
        mostrarControlesEdicion(false);
        renderAllPages();
    } else {
        $container.html('').append($singleCanvas);
        $.each(draggableFields, function (index, fieldObj) {
            $container.append(fieldObj.container);
        });
        mostrarControlesEdicion(true);
        renderSinglePage(pageNum);
    }
});

function mostrarControlesEdicion(mostrar) {
    const displayValue = mostrar ? "inline-block" : "none";
    $('#prevPageBtn, #nextPageBtn, #zoomInBtn, #zoomOutBtn, #pageNumSpan').parent().css('display', displayValue);
    $('#guardarCamposBtn').css('display', mostrar && draggableFields.length > 0 ? "inline-block" : "none");
}

function loadFields() {
    ajaxRequest({
        url: '/edit-template/list-fields',
        method: 'POST',
        onSuccess: function (response) {

            // <button id="add-field">Agregar Campo de Texto (Editable)</button>
            // <button id="add-dropdown">Agregar Lista Desplegable</button>
            // <button id="add-image">Agregar Campo de Imagen</button>
            // response.data.forEach(function (campo) {
            //     const propiedades = campo.propiedades;

            //     var button = $('<button>', {
            //         text: campo.nombre,
            //         class: 'btnField',
            //         id: 'field-' + campo.tipo_campo + '-' + campo.id,
            //         click: function () {
            //             const annotationLayer = konvaAnnotations[pageNumGlobal];

            //             switch (parseInt(campo.tipo_campo_id)) {
            //                 case TIPO_CAMPO_TEXT: {
            //                     unselectAnnotation();

            //                     const text = new Konva.Text({
            //                         align: propiedades.align, // left, center, right
            //                         draggable: propiedades.draggable,
            //                         fill: propiedades.fill,
            //                         fontFamily: propiedades.fontFamily, // Arial, Times New Roman, Courier New, Verdana, Calibri
            //                         fontSize: propiedades.fontSize,
            //                         fontStyle: propiedades.fontStyle, // normal, italic, bold, 500, italic bold
            //                         id: Date.now(),
            //                         idField: propiedades.id,
            //                         isEditable: propiedades.isEditable,
            //                         lineHeight: propiedades.lineHeight,
            //                         maxChar: propiedades.maxChar,
            //                         name: propiedades.name,
            //                         padding: propiedades.padding,
            //                         page: pageNumGlobal,
            //                         text: propiedades.text,
            //                         textDecoration: propiedades.textDecoration, // line-through, underline, empty string
            //                         type: propiedades.type,
            //                         verticalAlign: propiedades.verticalAlign, // top, middle, bottom
            //                         width: propiedades.width,
            //                         wrap: propiedades.wrap, // word, char, none
            //                         x: propiedades.x,
            //                         y: propiedades.y,
            //                     });

            //                     annotationLayer.add(text);
            //                     annotationLayer.draw();

            //                     annotationsData[pageNumGlobal].push({
            //                         align: text.align(),
            //                         draggable: text.draggable(),
            //                         fill: text.fill(),
            //                         fontFamily: text.fontFamily(),
            //                         fontSize: text.fontSize(),
            //                         fontStyle: text.fontStyle(),
            //                         id: text.id(),
            //                         idField: text.attrs.idField,
            //                         isEditable: text.attrs.isEditable,
            //                         lineHeight: text.lineHeight(),
            //                         maxChar: text.attrs.maxChar,
            //                         name: text.name(),
            //                         padding: text.padding(),
            //                         page: text.attrs.page,
            //                         text: text.text(),
            //                         textDecoration: text.textDecoration(),
            //                         type: text.attrs.type,
            //                         verticalAlign: text.verticalAlign(),
            //                         width: text.width(),
            //                         wrap: text.wrap(),
            //                         x: text.x(),
            //                         y: text.y(),
            //                     });

            //                     setupAnnotationEvents("text", text);
            //                     break;
            //                 }

            //                 case TIPO_CAMPO_SELECT: {
            //                     unselectAnnotation();

            //                     const select = new Konva.Text({
            //                         align: propiedades.align, // left, center, right
            //                         draggable: propiedades.draggable,
            //                         fill: propiedades.fill,
            //                         fontFamily: propiedades.fontFamily, // Arial, Times New Roman, Courier New, Verdana, Calibri
            //                         fontSize: propiedades.fontSize,
            //                         fontStyle: propiedades.fontStyle, // normal, italic, bold, 500, italic bold
            //                         id: Date.now(),
            //                         idField: propiedades.id,
            //                         isEditable: propiedades.isEditable,
            //                         lineHeight: propiedades.lineHeight,
            //                         name: propiedades.name,
            //                         options: propiedades.options,
            //                         padding: propiedades.padding,
            //                         page: pageNumGlobal,
            //                         text: propiedades.text,
            //                         textDecoration: propiedades.textDecoration, // line-through, underline, empty string
            //                         type: propiedades.type,
            //                         value: propiedades.value,
            //                         verticalAlign: propiedades.verticalAlign, // top, middle, bottom
            //                         width: propiedades.width,
            //                         wrap: propiedades.wrap, // word, char, none
            //                         x: propiedades.x,
            //                         y: propiedades.y,
            //                     });

            //                     annotationLayer.add(select);
            //                     annotationLayer.draw();

            //                     annotationsData[pageNumGlobal].push({
            //                         align: select.align(),
            //                         draggable: select.draggable(),
            //                         fill: select.fill(),
            //                         fontFamily: select.fontFamily(),
            //                         fontSize: select.fontSize(),
            //                         fontStyle: select.fontStyle(),
            //                         id: select.id(),
            //                         idField: select.attrs.idField,
            //                         isEditable: select.attrs.isEditable,
            //                         lineHeight: select.lineHeight(),
            //                         name: select.name(),
            //                         options: select.attrs.options,
            //                         padding: select.padding(),
            //                         page: select.attrs.page,
            //                         text: select.text(),
            //                         textDecoration: select.textDecoration(),
            //                         type: select.attrs.type,
            //                         value: select.attrs.value,
            //                         verticalAlign: select.verticalAlign(),
            //                         width: select.width(),
            //                         wrap: select.wrap(),
            //                         x: select.x(),
            //                         y: select.y(),
            //                     });

            //                     setupAnnotationEvents("select", select);
            //                     break;
            //                 }

            //                 case TIPO_CAMPO_QR: {
            //                     unselectAnnotation();

            //                     const objImg = new Image();
            //                     objImg.src = propiedades.src;

            //                     const image = new Konva.Image({
            //                         draggable: propiedades.draggable,
            //                         height: propiedades.height,
            //                         id: Date.now(),
            //                         idField: propiedades.id,
            //                         image: objImg,
            //                         isEditable: propiedades.isEditable,
            //                         name: propiedades.name,
            //                         opacity: propiedades.opacity,
            //                         page: pageNumGlobal,
            //                         rotation: propiedades.rotation,
            //                         src: objImg.src,
            //                         type: propiedades.type,
            //                         width: propiedades.width,
            //                         x: propiedades.x,
            //                         y: propiedades.y,
            //                     });

            //                     annotationLayer.add(image);
            //                     annotationLayer.draw();

            //                     annotationsData[pageNumGlobal].push({
            //                         draggable: image.draggable(),
            //                         height: image.height(),
            //                         id: image.id(),
            //                         idField: image.attrs.idField,
            //                         image: image.image(),
            //                         isEditable: image.attrs.isEditable,
            //                         name: image.name(),
            //                         opacity: image.opacity(),
            //                         page: image.attrs.page,
            //                         rotation: image.rotation(),
            //                         src: objImg.src,
            //                         type: image.attrs.type,
            //                         width: image.width(),
            //                         x: image.x(),
            //                         y: image.y(),
            //                     });

            //                     setupAnnotationEvents("image", image);
            //                     break;
            //                 }
            //                 default:
            //                     break;
            //             }
            //         }
            //     });

            //     $('#toolbar').append(button);
            // });

            // // Crear el botón Guardar
            // const saveButton = $('<button>', {
            //     id: 'save-template-btn',
            //     text: 'Guardar',
            //     class: 'btn btn-primary',
            //     click: saveTemplate
            // }).css({
            //     "margin-left": "10px"
            // });

            // $('#toolbar').append(saveButton);

            // // Crear el botón Salir
            // const backButton = $('<button>', {
            //     text: 'Atrás',
            //     class: 'btn btn-danger',
            //     click: goBack
            // }).css({
            //     "margin-left": "10px"
            // });

            // $('#toolbar').append(backButton);
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