const UNIT_PRICE = 100;
const quantityButtons = [...document.querySelectorAll("[data-quantity]")];
const lineItem = document.querySelector("#line-item");
const totalLabel = document.querySelector("#total");
const payButton = document.querySelector("#pay-button");
const paymentStatus = document.querySelector("#payment-status");
let quantity = 1;

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

function selectQuantity(nextQuantity) {
  quantity = nextQuantity;
  quantityButtons.forEach((button) => {
    const selected = Number(button.dataset.quantity) === quantity;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-checked", String(selected));
  });
  lineItem.textContent = `Pack Arcade Crew × ${quantity}`;
  totalLabel.textContent = clp.format(UNIT_PRICE * quantity);
}

quantityButtons.forEach((button) => {
  button.addEventListener("click", () => selectQuantity(Number(button.dataset.quantity)));
});

payButton.addEventListener("click", async () => {
  payButton.disabled = true;
  payButton.firstChild.textContent = "Preparando pago ";
  paymentStatus.textContent = "";

  try {
    const response = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity }),
    });
    const data = await response.json();

    if (!response.ok || !data.init_point) {
      throw new Error(data.error || "No se pudo iniciar el pago.");
    }

    window.location.assign(data.init_point);
  } catch (error) {
    paymentStatus.textContent = error.message || "No se pudo iniciar el pago. Intenta nuevamente.";
    payButton.disabled = false;
    payButton.firstChild.textContent = "Pagar ";
  }
});
