<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>PDF Anotaciones</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/konva@9/konva.min.js"></script>
    <style>
        #pdf-container {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 20px;
            margin: 20px;
        }

        .page-container {
            position: relative;
            border: 1px solid #ddd;
            margin: 10px 0;
        }

        canvas {
            border: 1px solid black;
            display: block;
        }

        .konva-container {
            position: absolute;
            top: 0;
            left: 0;
        }

        .text-editor {
            position: absolute;
            display: none;
            font-size: 16px;
            border: 1px solid #ccc;
            background: white;
            z-index: 10;
        }
    </style>
</head>

<body>
    <div id="pdf-container"></div>

    <script>
        const pdfUrl = "/storage/demo.pdf";
        const pdfContainer = document.getElementById("pdf-container");

        const annotationsData = {
            1: [{
                    x: 100,
                    y: 100,
                    text: "Nombre",
                    fontSize: 30,
                    fill: "red"
                },
                {
                    x: 200,
                    y: 150,
                    text: "Apellido",
                    fontSize: 30,
                    fill: "blue"
                }
            ]
        };

        async function loadPDF(pdfUrl) {
            const pdfDoc = await pdfjsLib.getDocument(pdfUrl).promise;
            for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
                await renderPage(pdfDoc, pageNum);
            }
        }

        async function renderPage(pdfDoc, pageNum) {
            const page = await pdfDoc.getPage(pageNum);
            const viewport = page.getViewport({
                scale: 1.5
            });

            const pageContainer = document.createElement("div");
            pageContainer.classList.add("page-container");
            pageContainer.style.width = `${viewport.width}px`;
            pageContainer.style.height = `${viewport.height + 40}px`;
            pdfContainer.appendChild(pageContainer);

            const pdfCanvas = document.createElement("canvas");
            const pdfContext = pdfCanvas.getContext("2d");
            pdfCanvas.width = viewport.width;
            pdfCanvas.height = viewport.height;
            pageContainer.appendChild(pdfCanvas);

            const konvaContainer = document.createElement("div");
            konvaContainer.classList.add("konva-container");
            konvaContainer.style.width = `${viewport.width}px`;
            konvaContainer.style.height = `${viewport.height}px`;
            pageContainer.appendChild(konvaContainer);

            const textEditor = document.createElement("input");
            textEditor.type = "text";
            textEditor.classList.add("text-editor");
            pageContainer.appendChild(textEditor);

            await page.render({
                canvasContext: pdfContext,
                viewport: viewport,
            }).promise;

            renderAnnotations(konvaContainer, pageNum, viewport, textEditor);
        }

        function renderAnnotations(container, pageNum, viewport, textEditor) {
            const stage = new Konva.Stage({
                container: container,
                width: viewport.width,
                height: viewport.height,
            });

            const annotationLayer = new Konva.Layer();
            stage.add(annotationLayer);

            if (annotationsData[pageNum]) {
                annotationsData[pageNum].forEach(data => {
                    const annotation = new Konva.Text({
                        x: data.x,
                        y: data.y,
                        text: data.text,
                        fontSize: data.fontSize,
                        fill: data.fill,
                        draggable: false,
                    });

                    setupAnnotationEvents(annotation, annotationLayer, textEditor);
                    annotationLayer.add(annotation);
                });
            }

            annotationLayer.draw();
        }

        function setupAnnotationEvents(textNode, layer, textEditor) {
            textNode.on("dblclick", () => {
                showTextEditor(textNode, layer, textEditor);
            });
        }

        function showTextEditor(textNode, layer, textEditor) {
            const scaleX = textNode.scaleX();
            const scaleY = textNode.scaleY();

            textEditor.style.left = `${textNode.attrs.x}px`;
            textEditor.style.top = `${textNode.attrs.y}px`;
            textEditor.style.width = `${textNode.width() * scaleX}px`;
            textEditor.style.fontSize = `${textNode.fontSize() * scaleX}px`;
            textEditor.style.display = "block";

            textEditor.value = textNode.text();
            textEditor.focus();

            textEditor.onkeydown = (e) => {
                if (e.key === "Enter") {
                    textNode.text(textEditor.value);
                    textEditor.style.display = "none";
                    layer.batchDraw();
                }
            };

            textEditor.onblur = () => {
                textNode.text(textEditor.value);
                textEditor.style.display = "none";
                layer.batchDraw();
            };
        }

        loadPDF(pdfUrl);
    </script>
</body>

</html>
