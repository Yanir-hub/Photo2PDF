const state = {
  images: [],
  pdfBlob: null,
  pdfUrl: null
};

const allowedTypes = [
  "image/jpeg",
  "image/jpg",
  "image/png"
];

const pageSizes = {
  A4: { width: 595.28, height: 841.89 }, // points
  LETTER: { width: 612, height: 792 }
};

const margins = {
  none: 0,
  small: 20,
  medium: 40
};

const fileInput = document.getElementById("file-input");
const dropZone = document.getElementById("drop-zone");
const previewList = document.getElementById("preview-list");
const convertBtn = document.getElementById("convert-btn");
const previewBtn = document.getElementById("preview-btn");
const clearBtn = document.getElementById("clear-btn");
const errorEl = document.getElementById("error");
const statusEl = document.getElementById("status");
const pageSizeSelect = document.getElementById("page-size");
const orientationSelect = document.getElementById("orientation");
const marginSelect = document.getElementById("margin");
const pdfNameInput = document.getElementById("pdf-name");
const pdfPreviewModal = document.getElementById("pdf-preview-modal");
const pdfPreview = document.getElementById("pdf-preview");
const closeModal = document.getElementById("close-modal");
const darkModeToggle = document.getElementById("dark-mode-toggle");

document.getElementById("year").textContent = new Date().getFullYear();

// Dark mode toggle
const isDarkMode = localStorage.getItem("darkMode") === "true";
if (isDarkMode) {
  document.body.classList.add("dark-mode");
}

darkModeToggle.addEventListener("click", () => {
  document.body.classList.toggle("dark-mode");
  localStorage.setItem("darkMode", document.body.classList.contains("dark-mode"));
});

// Modal close
closeModal.addEventListener("click", () => {
  pdfPreviewModal.style.display = "none";
});

pdfPreviewModal.addEventListener("click", (e) => {
  if (e.target === pdfPreviewModal) {
    pdfPreviewModal.style.display = "none";
  }
});

fileInput.addEventListener("change", (e) => handleFiles(e.target.files));

["dragenter", "dragover"].forEach((type) => {
  dropZone.addEventListener(type, (event) => {
    event.preventDefault();
    event.stopPropagation();
    dropZone.classList.add("active");
  });
});

["dragleave", "drop"].forEach((type) => {
  dropZone.addEventListener(type, (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (type === "drop") {
      handleFiles(event.dataTransfer.files);
    }
    dropZone.classList.remove("active");
  });
});

convertBtn.addEventListener("click", () => convertToPdf(false));
previewBtn.addEventListener("click", () => convertToPdf(true));

clearBtn.addEventListener("click", () => {
  state.images = [];
  state.pdfBlob = null;
  if (state.pdfUrl) {
    URL.revokeObjectURL(state.pdfUrl);
    state.pdfUrl = null;
  }
  renderPreviews();
  fileInput.value = "";
  setStatus("");
  setError("");
  pdfPreviewModal.style.display = "none";
});

function setStatus(message) {
  statusEl.textContent = message;
}

function setError(message) {
  errorEl.textContent = message;
}

async function handleFiles(fileList) {
  if (!fileList.length) {
    setError("Please select at least one image to continue.");
    return;
  }
  setError("");

  for (const file of fileList) {
    if (!allowedTypes.includes(file.type.toLowerCase())) {
      setError(
        `Skipped ${file.name || "one file"} – unsupported format (${file.type}).`
      );
      continue;
    }

    try {
      const dataUrl = await fileToDataUrl(file);

      state.images.push({
        id: crypto.randomUUID(),
        name: file.name || "photo",
        type: file.type.toLowerCase().includes("png") ? "png" : "jpg",
        dataUrl,
        rotation: 0
      });
    } catch (error) {
      console.error(error);
      setError(`Could not load ${file.name || "one file"}. Please try again.`);
    }
  }

  renderPreviews();
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

function renderPreviews() {
  previewList.innerHTML = "";
  const orderNote = document.getElementById("order-note");

  if (!state.images.length) {
    previewList.innerHTML = "<p>No photos added yet.</p>";
    orderNote.style.display = "none";
    return;
  }

  orderNote.style.display = "block";

  state.images.forEach((img, index) => {
    const card = document.createElement("div");
    card.className = "preview-card";
    card.dataset.id = img.id;

    const rotation = img.rotation || 0;
    card.innerHTML = `
      <div class="image-wrapper">
        <img src="${img.dataUrl}" alt="Preview ${index + 1}" style="transform: rotate(${rotation}deg);" />
        <span class="order-badge">${index + 1}</span>
      </div>
      <span class="filename">${img.name}</span>
      <div class="card-actions">
        <button data-action="up">Up</button>
        <button data-action="down">Down</button>
        <button data-action="rotate">Rotate</button>
        <button data-action="remove">Remove</button>
      </div>
    `;

    card
      .querySelector("[data-action='up']")
      .addEventListener("click", () => moveImage(index, -1));
    card
      .querySelector("[data-action='down']")
      .addEventListener("click", () => moveImage(index, 1));
    card
      .querySelector("[data-action='rotate']")
      .addEventListener("click", () => rotateImage(index));
    card
      .querySelector("[data-action='remove']")
      .addEventListener("click", () => removeImage(index));

    previewList.appendChild(card);
  });
}

function moveImage(index, direction) {
  const newIndex = index + direction;
  if (newIndex < 0 || newIndex >= state.images.length) return;
  const [item] = state.images.splice(index, 1);
  state.images.splice(newIndex, 0, item);
  renderPreviews();
}

function removeImage(index) {
  state.images.splice(index, 1);
  renderPreviews();
}

function rotateImage(index) {
  if (!state.images[index]) return;
  state.images[index].rotation = ((state.images[index].rotation || 0) + 90) % 360;
  renderPreviews();
}

async function convertToPdf(previewOnly = false) {
  if (!state.images.length) {
    setError("Add some photos before converting.");
    return;
  }

  setError("");
  setStatus("Preparing PDF...");
  previewBtn.disabled = true;
  convertBtn.disabled = true;

  try {
    const pdfDoc = await PDFLib.PDFDocument.create();
    const selectedSize = pageSizeSelect.value;
    const orientation = orientationSelect.value;
    const margin = margins[marginSelect.value] ?? margins.none;
    const { width, height } = pageSizes[selectedSize];

    for (let i = 0; i < state.images.length; i += 1) {
      const img = state.images[i];
      setStatus(`Adding page ${i + 1} of ${state.images.length}...`);

      // Apply rotation to image data
      const rotatedDataUrl = await applyRotationToImage(img.dataUrl, img.rotation || 0, img.type);
      
      const embeddedImage = img.type === "png"
        ? await pdfDoc.embedPng(rotatedDataUrl)
        : await pdfDoc.embedJpg(rotatedDataUrl);

      const page =
        orientation === "landscape"
          ? pdfDoc.addPage([height, width])
          : pdfDoc.addPage([width, height]);

      const pageWidth = page.getWidth();
      const pageHeight = page.getHeight();
      const boundsWidth = pageWidth - margin * 2;
      const boundsHeight = pageHeight - margin * 2;

      const scale = Math.min(
        boundsWidth / embeddedImage.width,
        boundsHeight / embeddedImage.height
      );
      const scaledWidth = embeddedImage.width * scale;
      const scaledHeight = embeddedImage.height * scale;

      const x = (pageWidth - scaledWidth) / 2;
      const y = (pageHeight - scaledHeight) / 2;

      page.drawImage(embeddedImage, {
        x,
        y,
        width: scaledWidth,
        height: scaledHeight
      });
    }

    setStatus("Finalizing PDF...");
    const pdfBytes = await pdfDoc.save();
    
    // Clean up old blob URL if exists
    if (state.pdfUrl) {
      URL.revokeObjectURL(state.pdfUrl);
    }
    
    state.pdfBlob = new Blob([pdfBytes], { type: "application/pdf" });
    state.pdfUrl = URL.createObjectURL(state.pdfBlob);
    
    if (previewOnly) {
      pdfPreview.src = state.pdfUrl;
      pdfPreviewModal.style.display = "flex";
      setStatus("PDF preview ready!");
    } else {
      const filename = pdfNameInput.value.trim() || "converted-photos";
      downloadBlob(pdfBytes, `${filename}.pdf`);
      setStatus("Done! Your PDF is ready.");
    }
  } catch (error) {
    console.error(error);
    setError("Conversion failed. Please try again.");
    setStatus("");
  } finally {
    previewBtn.disabled = false;
    convertBtn.disabled = false;
  }
}

function applyRotationToImage(dataUrl, rotation, imageType) {
  return new Promise((resolve, reject) => {
    if (rotation === 0 || rotation === 360) {
      resolve(dataUrl);
      return;
    }
    
    const img = new Image();
    img.onerror = () => reject(new Error("Failed to load image for rotation"));
    
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        
        // Adjust canvas size based on rotation
        if (rotation === 90 || rotation === 270) {
          canvas.width = img.height;
          canvas.height = img.width;
        } else {
          canvas.width = img.width;
          canvas.height = img.height;
        }
        
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate((rotation * Math.PI) / 180);
        ctx.drawImage(img, -img.width / 2, -img.height / 2);
        
        // Preserve original image format
        const mimeType = imageType === "png" ? "image/png" : "image/jpeg";
        const rotatedDataUrl = canvas.toDataURL(mimeType, 0.95);
        resolve(rotatedDataUrl);
      } catch (error) {
        console.error("Rotation error:", error);
        reject(error);
      }
    };
    
    img.src = dataUrl;
  });
}

function downloadBlob(data, filename) {
  const blob = new Blob([data], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Tip: adjust default settings by changing select default values in index.html.

