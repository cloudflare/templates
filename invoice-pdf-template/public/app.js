// Plain browser JS for the form. Talks to the Worker's /api/* routes only.

const form = document.getElementById("invoice-form");
const itemsBody = document.querySelector("#items tbody");
const listBody = document.querySelector("#list tbody");
const emptyNote = document.getElementById("empty");
const status = document.getElementById("status");
const renderButton = document.getElementById("render");

function money(amount, currency) {
	try {
		return new Intl.NumberFormat("en-US", {
			style: "currency",
			currency,
		}).format(amount);
	} catch {
		return `${currency} ${amount.toFixed(2)}`;
	}
}

function addItem(description = "", quantity = 1, unitPrice = "") {
	const row = document.createElement("tr");
	row.innerHTML = `
		<td><input name="description" required placeholder="Design work" aria-label="Description"></td>
		<td><input name="quantity" type="number" min="0" step="any" required aria-label="Quantity"></td>
		<td><input name="unitPrice" type="number" min="0" step="0.01" required aria-label="Unit price"></td>
		<td class="num amount">$0.00</td>
		<td><button type="button" class="remove" aria-label="Remove line item">&times;</button></td>`;
	row.querySelector('[name="description"]').value = description;
	row.querySelector('[name="quantity"]').value = quantity;
	row.querySelector('[name="unitPrice"]').value = unitPrice;
	row.querySelector(".remove").addEventListener("click", () => {
		row.remove();
		updateTotals();
	});
	itemsBody.append(row);
	updateTotals();
}

function readItems() {
	return [...itemsBody.querySelectorAll("tr")].map((row) => ({
		description: row.querySelector('[name="description"]').value,
		quantity: Number(row.querySelector('[name="quantity"]').value),
		unitPrice: Number(row.querySelector('[name="unitPrice"]').value),
	}));
}

function updateTotals() {
	const currency = form.elements.currency.value;
	const taxRate = Number(form.elements.taxRate.value) || 0;
	let subtotal = 0;
	for (const row of itemsBody.querySelectorAll("tr")) {
		const qty = Number(row.querySelector('[name="quantity"]').value) || 0;
		const price = Number(row.querySelector('[name="unitPrice"]').value) || 0;
		const amount = qty * price;
		subtotal += amount;
		row.querySelector(".amount").textContent = money(amount, currency);
	}
	const tax = subtotal * (taxRate / 100);
	document.getElementById("subtotal").textContent = money(subtotal, currency);
	document.getElementById("tax").textContent = money(tax, currency);
	document.getElementById("total").textContent = money(
		subtotal + tax,
		currency,
	);
}

function showStatus(message, isError = false) {
	status.textContent = "";
	if (typeof message === "string") {
		status.textContent = message;
	} else {
		status.append(message);
	}
	status.className = isError ? "status error" : "status";
	status.hidden = false;
}

async function loadList() {
	const res = await fetch("/api/invoices");
	const { invoices } = await res.json();
	listBody.textContent = "";
	emptyNote.hidden = invoices.length > 0;
	for (const inv of invoices) {
		const row = document.createElement("tr");
		row.innerHTML = `
			<td class="number"></td>
			<td class="client"></td>
			<td class="issued"></td>
			<td class="num total"></td>
			<td class="actions">
				<a class="open" target="_blank" rel="noopener">Open PDF</a>
				<button type="button" class="delete">Delete</button>
			</td>`;
		row.querySelector(".number").textContent = inv.number;
		row.querySelector(".client").textContent = inv.clientName;
		row.querySelector(".issued").textContent = inv.issueDate;
		row.querySelector(".total").textContent = money(inv.total, inv.currency);
		row.querySelector(".open").href = `/api/invoices/${inv.id}/pdf`;
		row.querySelector(".delete").addEventListener("click", async () => {
			await fetch(`/api/invoices/${inv.id}`, { method: "DELETE" });
			await loadList();
		});
		listBody.append(row);
	}
}

form.addEventListener("input", updateTotals);
form.addEventListener("change", updateTotals);
document.getElementById("add-item").addEventListener("click", () => addItem());

form.addEventListener("submit", async (event) => {
	event.preventDefault();
	renderButton.disabled = true;
	showStatus("Rendering...");

	const payload = {
		clientName: form.elements.clientName.value,
		clientEmail: form.elements.clientEmail.value,
		number: form.elements.number.value,
		issueDate: form.elements.issueDate.value,
		dueDate: form.elements.dueDate.value,
		currency: form.elements.currency.value,
		taxRate: Number(form.elements.taxRate.value) || 0,
		notes: form.elements.notes.value,
		items: readItems(),
	};

	try {
		const res = await fetch("/api/invoices", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(payload),
		});
		const data = await res.json();
		if (!res.ok) {
			showStatus(data.error || `Request failed (${res.status})`, true);
			return;
		}
		const link = document.createElement("a");
		link.href = data.pdfUrl;
		link.target = "_blank";
		link.rel = "noopener";
		link.textContent = `Open ${data.invoice.number}.pdf`;
		const wrapper = document.createElement("span");
		wrapper.append("Rendered. ", link);
		if (data.warnings.length > 0) {
			wrapper.append(` (${data.warnings.length} CSS warning(s), see console)`);
			console.warn(data.warnings);
		}
		showStatus(wrapper);
		await loadList();
	} catch (err) {
		showStatus(`Request failed: ${err.message}`, true);
	} finally {
		renderButton.disabled = false;
	}
});

form.elements.issueDate.value = new Date().toISOString().slice(0, 10);
addItem("Consulting", 10, 150);
addItem("Hosting (monthly)", 1, 40);
loadList();
