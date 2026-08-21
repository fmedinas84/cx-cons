const UNIT_PRICE = 100;
const quantityButtons = [...document.querySelectorAll("[data-quantity]")];
const lineItem = document.querySelector("#line-item");
const totalLabel = document.querySelector("#total");
const paymentStatus = document.querySelector("#payment-status");
const paymentLoading = document.querySelector("#payment-loading");
const paymentContainer = document.querySelector("#paymentBrick_container");
const paymentResult = document.querySelector("#payment-result");
const resultIcon = document.querySelector("#result-icon");
const resultTitle = document.querySelector("#result-title");
const resultDescription = document.querySelector("#result-description");
const resultDetails = document.querySelector("#result-details");
const retryButton = document.querySelector("#retry-payment");

let quantity = 1;
let bricksBuilder;
let paymentBrickController;
let currentIdempotencyKey;
let renderVersion = 0;

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

function setQuantityDisabled(disabled) {
  quantityButtons.forEach((button) => {
    button.disabled = disabled;
  });
}

function selectQuantity(nextQuantity) {
  if (nextQuantity === quantity) return;

  quantity = nextQuantity;
  quantityButtons.forEach((button) => {
    const selected = Number(button.dataset.quantity) === quantity;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-checked", String(selected));
  });
  lineItem.textContent = `Pack Arcade Crew × ${quantity}`;
  totalLabel.textContent = clp.format(UNIT_PRICE * quantity);
  currentIdempotencyKey = undefined;
  resetResult();
  renderPaymentBrick();
}

function createIdempotencyKey() {
  if (!currentIdempotencyKey) {
    currentIdempotencyKey = crypto.randomUUID();
  }

  return currentIdempotencyKey;
}

function resetResult() {
  paymentResult.hidden = true;
  retryButton.hidden = true;
  paymentContainer.hidden = false;
  paymentStatus.textContent = "";
}

function showPaymentResult({ payment_id, status, status_detail }) {
  const presentation = {
    approved: {
      icon: "✓",
      title: "Pago aprobado",
      description: "Mercado Pago confirmó el pago de tus stickers ficticios.",
      className: "is-approved",
    },
    pending: {
      icon: "…",
      title: "Pago pendiente",
      description: "Mercado Pago todavía está procesando el pago.",
      className: "is-pending",
    },
    rejected: {
      icon: "×",
      title: "Pago rechazado",
      description: "Mercado Pago no pudo aprobar este intento de pago.",
      className: "is-rejected",
    },
  };
  const normalizedStatus = ["pending", "in_process"].includes(status) ? "pending" : status;
  const content = presentation[normalizedStatus] ?? {
    icon: "?",
    title: "Resultado recibido",
    description: "Mercado Pago devolvió un estado que debes revisar.",
    className: "is-pending",
  };

  paymentResult.className = `payment-result ${content.className}`;
  paymentResult.hidden = false;
  paymentContainer.hidden = true;
  paymentLoading.hidden = true;
  resultIcon.textContent = content.icon;
  resultTitle.textContent = content.title;
  resultDescription.textContent = content.description;
  resultDetails.innerHTML = "";

  const details = [
    ["Payment ID", payment_id ?? "No disponible"],
    ["Estado", status ?? "No disponible"],
    ["Detalle", status_detail ?? "No disponible"],
  ];
  details.forEach(([label, value]) => {
    const wrapper = document.createElement("div");
    const term = document.createElement("dt");
    const description = document.createElement("dd");
    term.textContent = label;
    description.textContent = String(value);
    wrapper.append(term, description);
    resultDetails.append(wrapper);
  });

  retryButton.hidden = normalizedStatus === "approved";
}

async function submitPayment(formData) {
  setQuantityDisabled(true);
  paymentStatus.textContent = "Procesando el pago…";

  try {
    const response = await fetch("/api/payment", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Idempotency-Key": createIdempotencyKey(),
      },
      body: JSON.stringify({
        quantity,
        token: formData.token,
        issuer_id: formData.issuer_id,
        payment_method_id: formData.payment_method_id,
        installments: formData.installments,
        payer: formData.payer,
      }),
    });
    const data = await response.json();

    if (!response.ok) {
      if (response.status < 500) currentIdempotencyKey = undefined;
      throw new Error(data.error || "No se pudo procesar el pago.");
    }

    currentIdempotencyKey = undefined;
    paymentStatus.textContent = "";
    showPaymentResult(data);
  } catch (error) {
    paymentStatus.textContent = error.message || "No se pudo procesar el pago. Intenta nuevamente.";
    throw error;
  } finally {
    setQuantityDisabled(false);
  }
}

async function renderPaymentBrick() {
  if (!bricksBuilder) return;

  const version = ++renderVersion;
  setQuantityDisabled(true);
  paymentLoading.hidden = false;
  paymentLoading.textContent = "Cargando formulario de pago…";
  paymentContainer.hidden = false;
  paymentStatus.textContent = "";

  try {
    if (paymentBrickController) {
      await paymentBrickController.unmount();
      paymentBrickController = undefined;
    }

    if (version !== renderVersion) return;

    paymentBrickController = await bricksBuilder.create("payment", "paymentBrick_container", {
      initialization: {
        amount: UNIT_PRICE * quantity,
      },
      customization: {
        visual: {
          style: { theme: "default" },
        },
        paymentMethods: {
          creditCard: "all",
          debitCard: "all",
        },
      },
      callbacks: {
        onReady: () => {
          paymentLoading.hidden = true;
          setQuantityDisabled(false);
        },
        onSubmit: ({ formData }) => submitPayment(formData),
        onError: (error) => {
          console.error("Error de Checkout Bricks:", error);
          paymentLoading.hidden = true;
          setQuantityDisabled(false);
          paymentStatus.textContent = "No pudimos cargar el formulario de Mercado Pago.";
        },
      },
    });
  } catch (error) {
    console.error("Error al inicializar Checkout Bricks:", error);
    paymentLoading.hidden = true;
    setQuantityDisabled(false);
    paymentStatus.textContent = "No pudimos cargar el formulario de Mercado Pago.";
  }
}

async function initializeCheckoutBricks() {
  try {
    if (!window.MercadoPago) {
      throw new Error("El SDK de Mercado Pago no está disponible.");
    }

    const response = await fetch("/api/config", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok || !data.mercadoPagoPublicKey) {
      throw new Error(data.error || "Falta la Public Key de Mercado Pago.");
    }

    const mercadoPago = new window.MercadoPago(data.mercadoPagoPublicKey, {
      locale: "es-CL",
    });
    bricksBuilder = mercadoPago.bricks();
    await renderPaymentBrick();
  } catch (error) {
    paymentLoading.hidden = true;
    paymentStatus.textContent = error.message || "No pudimos iniciar Checkout Bricks.";
  }
}

quantityButtons.forEach((button) => {
  button.addEventListener("click", () => selectQuantity(Number(button.dataset.quantity)));
});

retryButton.addEventListener("click", async () => {
  currentIdempotencyKey = undefined;
  resetResult();
  await renderPaymentBrick();
});

initializeCheckoutBricks();
