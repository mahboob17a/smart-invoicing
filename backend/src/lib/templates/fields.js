// System fields a template can show (Design Document v5.1 §7.2), plus the
// name matching used to suggest a mapping for each {{token}} in an uploaded file.

const HEADER_FIELDS = [
  { key: "IssuingName", label: "Your company / letterhead name", group: "Your company" },
  { key: "IssuingAddress", label: "Your address", group: "Your company" },
  { key: "IssuingRegNo", label: "Your CR / registration no.", group: "Your company" },
  { key: "IssuingTaxNo", label: "Your VAT / tax no.", group: "Your company" },
  { key: "RecipientName", label: "Client name", group: "Client" },
  { key: "RecipientAddress", label: "Client address", group: "Client" },
  { key: "RecipientTaxNo", label: "Client VAT / tax no.", group: "Client" },
  { key: "InvoiceNo", label: "Invoice number (assigned by the app)", group: "Invoice" },
  { key: "InvoiceDate", label: "Invoice date", group: "Invoice" },
  { key: "Subtotal", label: "Subtotal (before tax)", group: "Totals" },
  { key: "TaxLabel", label: "Tax label (e.g. VAT)", group: "Totals" },
  { key: "TaxRate", label: "Tax rate %", group: "Totals" },
  { key: "TaxAmount", label: "Tax amount", group: "Totals" },
  { key: "GrandTotal", label: "Grand total", group: "Totals" },
  { key: "Currency", label: "Currency", group: "Totals" },
  { key: "VendorName", label: "Vendor name (reference)", group: "Source bill" },
  { key: "OriginalBillNo", label: "Vendor's original bill no. (reference)", group: "Source bill" },
  { key: "OriginalBillDate", label: "Vendor's bill date (reference)", group: "Source bill" },
];

const ITEM_FIELDS = [
  { key: "LineNo", label: "Line number" },
  { key: "Description", label: "Description" },
  { key: "Quantity", label: "Quantity" },
  { key: "Unit", label: "Unit" },
  { key: "MarkedUpRate", label: "Rate (after markup)" },
  { key: "OriginalRate", label: "Vendor's original rate" },
  { key: "Amount", label: "Amount" },
];

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

const SYNONYMS = {
  header: {
    InvoiceNo: ["invoiceno", "invno", "invoicenumber", "invnumber", "invoiceid", "taxinvoiceno"],
    InvoiceDate: ["invoicedate", "invdate", "date", "dated"],
    VendorName: ["vendorname", "vendor", "supplier", "suppliername"],
    OriginalBillNo: ["originalbillno", "billno", "billnumber", "vendorbillno", "vendorref", "vendorinvoiceno", "supplierinvoiceno"],
    OriginalBillDate: ["originalbilldate", "billdate", "vendorbilldate", "purchasedate"],
    RecipientName: ["recipientname", "recipient", "clientname", "client", "customer", "customername", "billto", "to", "buyer"],
    RecipientAddress: ["recipientaddress", "clientaddress", "customeraddress", "billtoaddress", "address"],
    RecipientTaxNo: ["recipienttaxno", "clientvat", "clientvatno", "customervat", "customertrn", "clienttrn", "buyervat"],
    IssuingName: ["issuingname", "companyname", "ourcompany", "sellername", "fromname"],
    IssuingAddress: ["issuingaddress", "companyaddress", "selleraddress"],
    IssuingRegNo: ["crno", "crnumber", "registrationno", "regno"],
    IssuingTaxNo: ["vatno", "vatnumber", "taxno", "trn", "vatin", "companyvat"],
    Subtotal: ["subtotal", "nettotal", "amountbeforetax", "pretax", "totalbeforevat", "totalexvat"],
    TaxLabel: ["taxlabel", "taxname"],
    TaxRate: ["taxrate", "vatrate", "vatpercent", "taxpercent", "vatpct"],
    TaxAmount: ["taxamount", "vat", "vatamount", "tax", "gst", "gstamount"],
    GrandTotal: ["grandtotal", "totalamount", "amountdue", "totalwithvat", "totalincvat", "netpayable", "total"],
    Currency: ["currency", "cur", "ccy"],
  },
  item: {
    LineNo: ["lineno", "sl", "slno", "sno", "srno", "sr", "no", "line"],
    Description: ["description", "desc", "item", "itemname", "particulars", "details"],
    Quantity: ["quantity", "qty"],
    Unit: ["unit", "uom", "units"],
    MarkedUpRate: ["rate", "unitprice", "price", "newrate", "markeduprate", "sellrate"],
    OriginalRate: ["originalrate", "vendorrate", "costrate", "cost", "oldrate"],
    Amount: ["amount", "amt", "total", "linetotal", "value"],
  },
};

function suggest(token, isItem) {
  const n = norm(token);
  const table = isItem ? SYNONYMS.item : SYNONYMS.header;
  const fields = isItem ? ITEM_FIELDS : HEADER_FIELDS;
  const exact = fields.find((f) => norm(f.key) === n);
  if (exact) return exact.key;
  for (const [key, words] of Object.entries(table)) if (words.includes(n)) return key;
  return null;
}

/** Tokens whose name says "invoice number" (e.g. {{Inv_No}}, {{InvoiceNumber}}). */
const looksLikeInvoiceNo = (token) => {
  const n = norm(token);
  return n.includes("inv") && (n.includes("no") || n.includes("num") || n.endsWith("id"));
};

function validFields(isItem) {
  return new Set((isItem ? ITEM_FIELDS : HEADER_FIELDS).map((f) => f.key));
}

/** Warnings for a set of mappings: [{token, isItem, field}] */
function mappingWarnings(mappings) {
  const w = [];
  for (const m of mappings) {
    if (!m.isItem && m.field === "OriginalBillNo" && looksLikeInvoiceNo(m.token)) {
      w.push(`{{${m.token}}} looks like your invoice-number field, but it is mapped to the vendor's original bill number. Your invoice number is assigned by the app; map this to "Invoice number" unless you really want the vendor's number here.`);
    }
  }
  const header = mappings.filter((m) => !m.isItem);
  if (header.length && !header.some((m) => m.field === "GrandTotal")) w.push("No token is mapped to Grand total.");
  const items = mappings.filter((m) => m.isItem);
  if (items.length && !items.some((m) => m.field === "Description")) w.push("No line-item token is mapped to Description.");
  return w;
}

module.exports = { HEADER_FIELDS, ITEM_FIELDS, suggest, looksLikeInvoiceNo, validFields, mappingWarnings, norm };
