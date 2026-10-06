import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import {
  Badge,
  Button,
  Card,
  CardHead,
  Empty,
  Field,
  Input,
  Modal,
  PageHead,
  Row,
  Select,
  Stat,
  Table,
  Td,
} from "@/components/ui";
import { useStore } from "@/lib/store";
import { inr, todayISO } from "@/lib/format";
import type {
  CustomerOrder,
  OrderItem,
  OrderStatus,
  Customer,
  Product,
  PaymentAccount,
  FinanceCompany,
  CreateOrderInput,
} from "@/lib/types";
import { OrderPrintVoucher } from "@/components/orders/OrderPrintVoucher";
import {
  generateOrderWhatsAppMessage,
  openOrderWhatsAppChat,
  type OrderWhatsAppTemplate,
} from "@/lib/whatsappOrders";
import {
  ShoppingCart,
  Plus,
  Search,
  Printer,
  MessageSquare,
  CheckCircle2,
  Clock,
  ArrowRight,
  FileText,
  XCircle,
  AlertCircle,
  IndianRupee,
  Calendar,
  User,
  Phone,
  Barcode,
  Trash2,
  Eye,
  RefreshCw,
  SlidersHorizontal,
  CreditCard,
  Building2,
  Receipt,
  Package,
  Sparkles,
} from "lucide-react";

export const Route = createFileRoute("/orders")({
  head: () => ({
    meta: [{ title: "Customer Order Management — Mobile Store ERP" }],
  }),
  component: OrdersPage,
});

type FilterTab = "ALL" | OrderStatus;

function OrdersPage() {
  const {
    db,
    createOrder,
    receiveOrderPayment,
    convertOrderToSale,
    cancelOrder,
    updateOrderStatus,
    addCustomer,
  } = useStore();

  // State
  const [activeTab, setActiveTab] = useState<FilterTab>("ALL");
  const [viewMode, setViewMode] = useState<"orders" | "analytics">("orders");
  const [query, setQuery] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<CustomerOrder | null>(null);

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [convertModalOpen, setConvertModalOpen] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [whatsAppModalOpen, setWhatsAppModalOpen] = useState(false);
  const [whatsAppTemplate, setWhatsAppTemplate] = useState<OrderWhatsAppTemplate>("CONFIRMED");
  const [whatsAppCustomText, setWhatsAppCustomText] = useState("");

  const orders: CustomerOrder[] = useMemo(() => db.orders || [], [db.orders]);
  const customers: Customer[] = useMemo(() => db.customers || [], [db.customers]);
  const products: Product[] = useMemo(() => db.products || [], [db.products]);
  const accounts: PaymentAccount[] = useMemo(() => db.paymentAccounts || [], [db.paymentAccounts]);
  const financeCompanies: FinanceCompany[] = useMemo(
    () => db.financeCompanies || [],
    [db.financeCompanies],
  );

  const customerMap = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers]);

  // Filtered orders
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      if (activeTab !== "ALL" && o.status !== activeTab) return false;
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      const customer = customerMap.get(o.customerId);
      const matchNo = o.orderNumber.toLowerCase().includes(q);
      const matchCust =
        customer?.name.toLowerCase().includes(q) || customer?.phone.toLowerCase().includes(q);
      const matchItems = o.items.some(
        (it) =>
          it.productName.toLowerCase().includes(q) ||
          (it.assignedImei && it.assignedImei.toLowerCase().includes(q)),
      );
      return matchNo || matchCust || matchItems;
    });
  }, [orders, activeTab, query, customerMap]);

  // Metrics
  const metrics = useMemo(() => {
    let totalValue = 0;
    let totalAdvance = 0;
    let balanceDue = 0;
    let pendingFulfillment = 0;
    let convertedCount = 0;
    let convertedValue = 0;

    for (const o of orders) {
      if (o.status !== "CANCELLED") {
        totalValue += o.totalAmount;
        totalAdvance += o.advancePaid;
      }
      if (o.status !== "CANCELLED" && o.status !== "CONVERTED_TO_SALE") {
        balanceDue += o.balanceDue;
        pendingFulfillment += 1;
      }
      if (o.status === "CONVERTED_TO_SALE") {
        convertedCount += 1;
        convertedValue += o.totalAmount;
      }
    }

    return {
      totalValue,
      totalAdvance,
      balanceDue,
      pendingFulfillment,
      convertedCount,
      convertedValue,
    };
  }, [orders]);

  // Status badge tone
  const getStatusTone = (status: OrderStatus) => {
    switch (status) {
      case "DRAFT":
        return "neutral";
      case "CONFIRMED":
        return "info";
      case "PARTIALLY_PAID":
        return "warning";
      case "READY":
        return "success";
      case "DELIVERED":
        return "success";
      case "CONVERTED_TO_SALE":
        return "neutral";
      case "CANCELLED":
        return "danger";
      default:
        return "neutral";
    }
  };

  const getStatusLabel = (status: OrderStatus) => {
    switch (status) {
      case "DRAFT":
        return "Draft";
      case "CONFIRMED":
        return "Confirmed";
      case "PARTIALLY_PAID":
        return "Partially Paid";
      case "READY":
        return "Ready for Pickup";
      case "DELIVERED":
        return "Delivered";
      case "CONVERTED_TO_SALE":
        return "Converted to Sale";
      case "CANCELLED":
        return "Cancelled";
      default:
        return status;
    }
  };

  // Open Actions
  const handleOpenDetails = (order: CustomerOrder) => {
    setSelectedOrder(order);
    setDetailsModalOpen(true);
  };

  const handleOpenPayment = (order: CustomerOrder) => {
    setSelectedOrder(order);
    setPaymentModalOpen(true);
  };

  const handleOpenConvert = (order: CustomerOrder) => {
    setSelectedOrder(order);
    setConvertModalOpen(true);
  };

  const handleOpenCancel = (order: CustomerOrder) => {
    setSelectedOrder(order);
    setCancelModalOpen(true);
  };

  const handleOpenPrint = (order: CustomerOrder) => {
    setSelectedOrder(order);
    setPrintModalOpen(true);
  };

  const handleOpenWhatsApp = (order: CustomerOrder) => {
    setSelectedOrder(order);
    const cust = customerMap.get(order.customerId);
    const tmpl: OrderWhatsAppTemplate =
      order.status === "READY"
        ? "READY"
        : order.status === "DELIVERED"
          ? "DELIVERED"
          : order.status === "CANCELLED"
            ? "CANCELLED"
            : order.paymentStatus === "PARTIALLY_PAID" || order.advancePaid > 0
              ? "PAYMENT_RECEIVED"
              : "CONFIRMED";

    setWhatsAppTemplate(tmpl);
    const msg = generateOrderWhatsAppMessage({
      template: tmpl,
      order,
      customerName: cust?.name || "Customer",
      customerPhone: cust?.phone || "",
      shopName: db.settings?.shopName,
      shopPhone: db.settings?.phone,
    });
    setWhatsAppCustomText(msg);
    setWhatsAppModalOpen(true);
  };

  return (
    <div className="space-y-6 animate-in-soft">
      {/* Top Header */}
      <PageHead
        title="Customer Orders & Advance Bookings"
        sub="Manage advance pre-orders, collect token payments, assign serials, and convert to sale invoices upon delivery."
        actions={
          <div className="flex items-center gap-2">
            <div className="flex bg-slate-100 p-0.5 rounded-xl border border-border/80">
              <button
                onClick={() => setViewMode("orders")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                  viewMode === "orders"
                    ? "bg-white text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Orders List
              </button>
              <button
                onClick={() => setViewMode("analytics")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                  viewMode === "analytics"
                    ? "bg-white text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Advance Register & Reports
              </button>
            </div>

            <Button variant="primary" onClick={() => setCreateModalOpen(true)} className="gap-1.5">
              <Plus className="size-4" />
              <span>New Order</span>
            </Button>
          </div>
        }
      />

      {/* KPI Stats Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        <Stat
          label="Total Orders Placed"
          value={inr(metrics.totalValue)}
          hint={`${orders.length} total orders recorded`}
          tone="info"
        />
        <Stat
          label="Pending Fulfillment"
          value={metrics.pendingFulfillment.toString()}
          hint="Orders awaiting delivery"
          tone="warning"
        />
        <Stat
          label="Advances Collected"
          value={inr(metrics.totalAdvance)}
          hint="Secured in cash & bank accounts"
          tone="success"
        />
        <Stat
          label="Outstanding Balance"
          value={inr(metrics.balanceDue)}
          hint="To collect upon pickup"
          tone="danger"
        />
        <Stat
          label="Converted to Sales"
          value={metrics.convertedCount.toString()}
          hint={`Value: ${inr(metrics.convertedValue)}`}
          tone="neutral"
        />
      </div>

      {viewMode === "orders" ? (
        <>
          {/* Status Tabs & Search Toolbar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            {/* Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none text-xs font-semibold">
              {(
                [
                  "ALL",
                  "CONFIRMED",
                  "PARTIALLY_PAID",
                  "READY",
                  "DELIVERED",
                  "CONVERTED_TO_SALE",
                  "CANCELLED",
                  "DRAFT",
                ] as FilterTab[]
              ).map((tab) => {
                const count =
                  tab === "ALL" ? orders.length : orders.filter((o) => o.status === tab).length;
                const active = activeTab === tab;
                return (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all whitespace-nowrap ${
                      active
                        ? "bg-slate-900 text-white shadow-sm font-bold"
                        : "bg-white/80 hover:bg-white text-slate-600 border border-border/80"
                    }`}
                  >
                    <span>{tab === "ALL" ? "All Orders" : getStatusLabel(tab as OrderStatus)}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                        active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Search Input */}
            <div className="relative min-w-[260px]">
              <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search order #, customer, phone, IMEI..."
                className="pl-9 h-9 text-xs"
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Orders Table */}
          <Card>
            <Table
              headers={[
                "Order # & Date",
                "Customer Details",
                "Items Ordered",
                ">Total Amount",
                ">Advance Paid",
                ">Balance Due",
                "Status",
                "Expected Delivery",
                ">Actions",
              ]}
            >
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center">
                    <Empty
                      title="No Orders Found"
                      message={
                        query
                          ? `No orders matching "${query}"`
                          : "No customer orders under this status filter."
                      }
                      icon={
                        <ShoppingCart className="size-8 mx-auto text-muted-foreground/50 mb-2" />
                      }
                    />
                  </td>
                </tr>
              ) : (
                filteredOrders.map((o) => {
                  const customer = customerMap.get(o.customerId);
                  const isConverted = o.status === "CONVERTED_TO_SALE";
                  const isCancelled = o.status === "CANCELLED";
                  const canPay = !isConverted && !isCancelled && o.balanceDue > 0;
                  const canConvert = !isConverted && !isCancelled;

                  return (
                    <Row key={o.id} onClick={() => handleOpenDetails(o)}>
                      {/* Order No & Date */}
                      <Td>
                        <div className="font-bold text-foreground flex items-center gap-1.5">
                          <span>{o.orderNumber}</span>
                          {o.reservationActive && (
                            <span
                              title="Stock reserved for this order"
                              className="size-2 rounded-full bg-indigo-500 animate-pulse"
                            />
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Calendar className="size-3" />
                          <span>{o.orderDate}</span>
                        </div>
                      </Td>

                      {/* Customer */}
                      <Td>
                        <div className="font-semibold text-foreground">
                          {customer?.name || "Walk-in Customer"}
                        </div>
                        <div className="text-[11.5px] text-muted-foreground flex items-center gap-1 mt-0.5 font-mono">
                          <Phone className="size-3" />
                          <span>{customer?.phone || "—"}</span>
                        </div>
                      </Td>

                      {/* Items */}
                      <Td>
                        <div className="max-w-[240px]">
                          <div className="truncate font-medium text-slate-800 text-[12px]">
                            {o.items.map((it) => `${it.productName} (x${it.quantity})`).join(", ")}
                          </div>
                          <div className="text-[10.5px] text-muted-foreground mt-0.5">
                            {o.items.length} line {o.items.length === 1 ? "item" : "items"}
                            {o.items.some((i) => i.assignedImei) && (
                              <span className="ml-1.5 text-indigo-600 font-mono">
                                • IMEI assigned
                              </span>
                            )}
                          </div>
                        </div>
                      </Td>

                      {/* Amounts */}
                      <Td right mono className="font-semibold text-foreground">
                        {inr(o.totalAmount)}
                      </Td>

                      <Td right mono className="text-emerald-700 font-semibold">
                        {inr(o.advancePaid)}
                      </Td>

                      <Td right mono>
                        {o.balanceDue > 0 ? (
                          <span className="font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200/60">
                            {inr(o.balanceDue)}
                          </span>
                        ) : (
                          <span className="text-emerald-600 font-medium text-xs">
                            ✓ Fully Cleared
                          </span>
                        )}
                      </Td>

                      {/* Status */}
                      <Td>
                        <Badge tone={getStatusTone(o.status)}>{getStatusLabel(o.status)}</Badge>
                      </Td>

                      {/* Expected Delivery */}
                      <Td>
                        {o.expectedDeliveryDate ? (
                          <span className="text-xs font-medium text-slate-700">
                            {o.expectedDeliveryDate}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">
                            Not specified
                          </span>
                        )}
                      </Td>

                      {/* Actions */}
                      <Td right>
                        <div
                          className="flex items-center justify-end gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {/* Print Booking Slip */}
                          <button
                            onClick={() => handleOpenPrint(o)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
                            title="Print Booking Voucher / Slip"
                          >
                            <Printer className="size-4" />
                          </button>

                          {/* WhatsApp Customer */}
                          <button
                            onClick={() => handleOpenWhatsApp(o)}
                            className="p-1.5 rounded-lg text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
                            title="WhatsApp Order Update"
                          >
                            <MessageSquare className="size-4" />
                          </button>

                          {/* Collect Balance */}
                          {canPay && (
                            <button
                              onClick={() => handleOpenPayment(o)}
                              className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors"
                              title="Receive Payment"
                            >
                              + Pay
                            </button>
                          )}

                          {/* Convert to Sale */}
                          {canConvert && (
                            <button
                              onClick={() => handleOpenConvert(o)}
                              className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors flex items-center gap-1"
                              title="Convert to Sale & Invoice"
                            >
                              <span>Convert</span>
                              <ArrowRight className="size-3" />
                            </button>
                          )}

                          {/* View details */}
                          <button
                            onClick={() => handleOpenDetails(o)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-foreground hover:bg-slate-100 transition-colors"
                            title="View Full Details"
                          >
                            <Eye className="size-4" />
                          </button>
                        </div>
                      </Td>
                    </Row>
                  );
                })
              )}
            </Table>
          </Card>
        </>
      ) : (
        /* Analytics & Advance Register View */
        <AnalyticsAndRegisterView
          orders={orders}
          customers={customers}
          accounts={accounts}
          onSelectOrder={handleOpenDetails}
        />
      )}

      {/* MODALS */}
      {/* 1. Create Order Modal */}
      {createModalOpen && (
        <CreateOrderModal
          open={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
          customers={customers}
          products={products}
          accounts={accounts}
          defaultPrefix={db.settings?.orderPrefix || "ORD-"}
          onCreateOrder={async (input) => {
            const res = await createOrder(input);
            setCreateModalOpen(false);
            if (res) {
              setSelectedOrder(res);
              // Prompt print or details
              setPrintModalOpen(true);
            }
          }}
          onQuickAddCustomer={async (c) => {
            return await addCustomer(c);
          }}
        />
      )}

      {/* 2. Order Details Modal */}
      {detailsModalOpen && selectedOrder && (
        <OrderDetailsModal
          open={detailsModalOpen}
          order={selectedOrder}
          customer={customerMap.get(selectedOrder.customerId)}
          accounts={accounts}
          onClose={() => {
            setDetailsModalOpen(false);
            setSelectedOrder(null);
          }}
          onStatusChange={async (newStatus, notes) => {
            await updateOrderStatus(selectedOrder.id, newStatus, notes);
            const updated = (db.orders || []).find((o) => o.id === selectedOrder.id);
            if (updated) setSelectedOrder(updated);
          }}
          onOpenPayment={() => {
            setDetailsModalOpen(false);
            setPaymentModalOpen(true);
          }}
          onOpenConvert={() => {
            setDetailsModalOpen(false);
            setConvertModalOpen(true);
          }}
          onOpenCancel={() => {
            setDetailsModalOpen(false);
            setCancelModalOpen(true);
          }}
          onOpenPrint={() => {
            setDetailsModalOpen(false);
            setPrintModalOpen(true);
          }}
          onOpenWhatsApp={() => {
            setDetailsModalOpen(false);
            handleOpenWhatsApp(selectedOrder);
          }}
        />
      )}

      {/* 3. Receive Payment Modal */}
      {paymentModalOpen && selectedOrder && (
        <ReceivePaymentModal
          open={paymentModalOpen}
          order={selectedOrder}
          customer={customerMap.get(selectedOrder.customerId)}
          accounts={accounts}
          onClose={() => {
            setPaymentModalOpen(false);
          }}
          onSubmitPayment={async (input) => {
            await receiveOrderPayment(input);
            setPaymentModalOpen(false);
            const updated = (db.orders || []).find((o) => o.id === selectedOrder.id);
            if (updated) {
              setSelectedOrder(updated);
              handleOpenWhatsApp(updated);
            }
          }}
        />
      )}

      {/* 4. Convert Order to Sale Modal */}
      {convertModalOpen && selectedOrder && (
        <ConvertOrderToSaleModal
          open={convertModalOpen}
          order={selectedOrder}
          customer={customerMap.get(selectedOrder.customerId)}
          accounts={accounts}
          financeCompanies={financeCompanies}
          onClose={() => setConvertModalOpen(false)}
          onConvert={async (input) => {
            const res = await convertOrderToSale(input);
            setConvertModalOpen(false);
            if (res) {
              alert(
                `Order ${selectedOrder.orderNumber} successfully converted to Sale Invoice ${res.sale.invoiceNo}!`,
              );
            }
          }}
        />
      )}

      {/* 5. Cancel Order Modal */}
      {cancelModalOpen && selectedOrder && (
        <CancelOrderModal
          open={cancelModalOpen}
          order={selectedOrder}
          customer={customerMap.get(selectedOrder.customerId)}
          accounts={accounts}
          onClose={() => setCancelModalOpen(false)}
          onCancel={async (input) => {
            await cancelOrder(input);
            setCancelModalOpen(false);
            const updated = (db.orders || []).find((o) => o.id === selectedOrder.id);
            if (updated) setSelectedOrder(updated);
          }}
        />
      )}

      {/* 6. Print Voucher Modal */}
      {printModalOpen && selectedOrder && (
        <Modal
          open={printModalOpen}
          onClose={() => setPrintModalOpen(false)}
          title={`Order Booking Voucher — ${selectedOrder.orderNumber}`}
          wide
        >
          <div className="space-y-4">
            <div className="border border-border/80 rounded-xl overflow-hidden bg-white shadow-xs p-2">
              <OrderPrintVoucher
                order={selectedOrder}
                customer={customerMap.get(selectedOrder.customerId)}
                settings={db.settings}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setPrintModalOpen(false)}>
                Close
              </Button>
              <Button variant="primary" onClick={() => window.print()} className="gap-1.5">
                <Printer className="size-4" />
                <span>Print Document</span>
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* 7. WhatsApp Share Modal */}
      {whatsAppModalOpen && selectedOrder && (
        <Modal
          open={whatsAppModalOpen}
          onClose={() => setWhatsAppModalOpen(false)}
          title={`WhatsApp Order Notification — ${selectedOrder.orderNumber}`}
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-foreground">Template Preset:</span>
              <div className="flex gap-1.5">
                {(
                  [
                    { id: "CONFIRMED", label: "Confirmed" },
                    { id: "PAYMENT_RECEIVED", label: "Payment" },
                    { id: "READY", label: "Ready" },
                    { id: "DELIVERED", label: "Delivered" },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      setWhatsAppTemplate(t.id);
                      const cust = customerMap.get(selectedOrder.customerId);
                      const msg = generateOrderWhatsAppMessage({
                        template: t.id,
                        order: selectedOrder,
                        customerName: cust?.name || "Customer",
                        customerPhone: cust?.phone || "",
                        shopName: db.settings?.shopName,
                        shopPhone: db.settings?.phone,
                      });
                      setWhatsAppCustomText(msg);
                    }}
                    className={`px-2 py-1 rounded text-[11px] font-semibold transition-colors ${
                      whatsAppTemplate === t.id
                        ? "bg-emerald-600 text-white"
                        : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <Field label="Message Text (Editable before sending)">
              <textarea
                rows={9}
                value={whatsAppCustomText}
                onChange={(e) => setWhatsAppCustomText(e.target.value)}
                className="w-full rounded-xl border border-border/90 bg-white/95 p-3 text-xs text-foreground font-mono outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all resize-none"
              />
            </Field>

            <div className="flex items-center justify-between pt-2">
              <div className="text-xs text-muted-foreground flex items-center gap-1 font-mono">
                <Phone className="size-3" />
                <span>To: {customerMap.get(selectedOrder.customerId)?.phone || "No phone"}</span>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setWhatsAppModalOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="success"
                  onClick={() => {
                    const cust = customerMap.get(selectedOrder.customerId);
                    if (cust?.phone) {
                      openOrderWhatsAppChat(cust.phone, whatsAppCustomText);
                    } else {
                      alert("Customer does not have a phone number on file.");
                    }
                  }}
                  className="gap-1.5"
                >
                  <MessageSquare className="size-4" />
                  <span>Send on WhatsApp</span>
                </Button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ==========================================
// CREATE ORDER MODAL
// ==========================================
function CreateOrderModal({
  open,
  onClose,
  customers,
  products,
  accounts,
  defaultPrefix,
  onCreateOrder,
  onQuickAddCustomer,
}: {
  open: boolean;
  onClose: () => void;
  customers: Customer[];
  products: Product[];
  accounts: PaymentAccount[];
  defaultPrefix: string;
  onCreateOrder: (input: CreateOrderInput) => Promise<void>;
  onQuickAddCustomer: (c: Partial<Customer>) => Promise<Customer | null>;
}) {
  const [orderNumber, setOrderNumber] = useState(
    `${defaultPrefix}${Date.now().toString().slice(-6)}`,
  );
  const [orderDate, setOrderDate] = useState(todayISO());
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState("");
  const [customerId, setCustomerId] = useState(customers[0]?.id || "");
  const [notes, setNotes] = useState("");

  // Quick Add Customer state
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCustName, setNewCustName] = useState("");
  const [newCustPhone, setNewCustPhone] = useState("");
  const [newCustAddress, setNewCustAddress] = useState("");

  // Items state
  const [items, setItems] = useState<
    Array<{
      productId: string;
      productName: string;
      quantity: number;
      unitPrice: number;
      discountAmount: number;
      taxRate: number;
      assignedImei: string;
    }>
  >([
    {
      productId: products[0]?.id || "",
      productName: products[0]?.name || "",
      quantity: 1,
      unitPrice: products[0]?.sellingPrice || 0,
      discountAmount: 0,
      taxRate: products[0]?.taxRate || 18,
      assignedImei: "",
    },
  ]);

  // Payment state
  const [advanceAmount, setAdvanceAmount] = useState<number>(0);
  const [paymentMode, setPaymentMode] = useState<"CASH" | "UPI" | "BANK_TRANSFER" | "CARD">("UPI");
  const [paymentAccountId, setPaymentAccountId] = useState<string>(accounts[0]?.id || "");
  const [transactionReference, setTransactionReference] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Calculations
  const lineCalculations = useMemo(() => {
    return items.map((it) => {
      const gross = it.quantity * it.unitPrice;
      const taxable = Math.max(0, gross - it.discountAmount);
      const tax = (taxable * it.taxRate) / 100;
      const total = taxable + tax;
      return { gross, taxable, tax, total };
    });
  }, [items]);

  const totalAmount = useMemo(
    () => lineCalculations.reduce((acc, c) => acc + c.total, 0),
    [lineCalculations],
  );

  const balanceDue = Math.max(0, totalAmount - advanceAmount);

  const handleProductSelect = (index: number, productId: string) => {
    const prod = products.find((p) => p.id === productId);
    if (!prod) return;
    const newItems = [...items];
    newItems[index] = {
      ...newItems[index],
      productId: prod.id,
      productName: prod.name,
      unitPrice: prod.sellingPrice,
      taxRate: prod.taxRate || 18,
      assignedImei: "",
    };
    setItems(newItems);
  };

  const handleAddItem = () => {
    const defaultP = products[0];
    setItems([
      ...items,
      {
        productId: defaultP?.id || "",
        productName: defaultP?.name || "",
        quantity: 1,
        unitPrice: defaultP?.sellingPrice || 0,
        discountAmount: 0,
        taxRate: defaultP?.taxRate || 18,
        assignedImei: "",
      },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) return;
    setItems(items.filter((_, i) => i !== index));
  };

  const handleQuickCustomerCreate = async () => {
    if (!newCustName.trim() || !newCustPhone.trim()) {
      alert("Please enter customer name and mobile number.");
      return;
    }
    const created = await onQuickAddCustomer({
      name: newCustName.trim(),
      phone: newCustPhone.trim(),
      address: newCustAddress.trim(),
      type: "Regular",
    });
    if (created) {
      setCustomerId(created.id);
      setShowNewCustomer(false);
      setNewCustName("");
      setNewCustPhone("");
      setNewCustAddress("");
    }
  };

  const handleSave = async (status: "CONFIRMED" | "DRAFT") => {
    if (!customerId) {
      alert("Please select or add a customer.");
      return;
    }
    if (items.length === 0 || items.some((it) => !it.productId || it.quantity <= 0)) {
      alert("Please ensure all order line items have a valid product and quantity.");
      return;
    }

    setIsSubmitting(true);
    try {
      await onCreateOrder({
        orderNumber,
        customerId,
        orderDate,
        expectedDeliveryDate: expectedDeliveryDate || undefined,
        status,
        items: items.map((it) => ({
          productId: it.productId,
          productName: it.productName,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          discountAmount: it.discountAmount,
          taxRate: it.taxRate,
          assignedImei: it.assignedImei || undefined,
        })),
        advancePayment:
          advanceAmount > 0
            ? {
                amount: advanceAmount,
                paymentMode,
                paymentAccountId: paymentAccountId || undefined,
                transactionReference: transactionReference || undefined,
                notes: "Initial advance payment at booking",
              }
            : undefined,
        notes: notes || undefined,
      });
    } catch (err: any) {
      alert(`Failed to create order: ${err.message || err}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Create New Customer Order" wide>
      <div className="space-y-5">
        {/* Order Header Fields */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Order Number">
            <Input
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
              className="font-mono font-semibold"
            />
          </Field>
          <Field label="Order Date">
            <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
          </Field>
          <Field label="Expected Delivery Date">
            <Input
              type="date"
              value={expectedDeliveryDate}
              onChange={(e) => setExpectedDeliveryDate(e.target.value)}
              placeholder="Select delivery target"
            />
          </Field>
        </div>

        {/* Customer Selection & Quick Add */}
        <Card className="p-3.5 bg-slate-50/70 border-slate-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-foreground uppercase tracking-wide flex items-center gap-1.5">
              <User className="size-3.5 text-primary" />
              <span>Customer Information</span>
            </span>
            <button
              type="button"
              onClick={() => setShowNewCustomer(!showNewCustomer)}
              className="text-xs font-semibold text-primary hover:underline cursor-pointer"
            >
              {showNewCustomer ? "← Select Existing Customer" : "+ Add New Customer"}
            </button>
          </div>

          {showNewCustomer ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
              <Field label="Full Name *">
                <Input
                  value={newCustName}
                  onChange={(e) => setNewCustName(e.target.value)}
                  placeholder="e.g. Rahul Sharma"
                />
              </Field>
              <Field label="Phone / WhatsApp *">
                <Input
                  value={newCustPhone}
                  onChange={(e) => setNewCustPhone(e.target.value)}
                  placeholder="10 digit mobile"
                />
              </Field>
              <div className="flex items-end gap-2">
                <Field label="City / Address" className="flex-1">
                  <Input
                    value={newCustAddress}
                    onChange={(e) => setNewCustAddress(e.target.value)}
                    placeholder="e.g. Harda"
                  />
                </Field>
                <Button
                  type="button"
                  variant="primary"
                  size="md"
                  onClick={handleQuickCustomerCreate}
                  className="mb-0.5 whitespace-nowrap"
                >
                  Save & Select
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Select Registered Customer">
                <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} — {c.phone} {c.city ? `(${c.city})` : ""}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="rounded-xl border border-border/80 bg-white p-2.5 text-xs text-slate-700 flex flex-col justify-center">
                {(() => {
                  const c = customers.find((x) => x.id === customerId);
                  return (
                    <>
                      <div className="font-bold text-foreground">{c?.name || "None"}</div>
                      <div className="text-muted-foreground font-mono">
                        Phone: {c?.phone || "—"} | City: {c?.city || c?.address || "—"}
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          )}
        </Card>

        {/* Product Items Selection */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-foreground uppercase tracking-wide flex items-center gap-1.5">
              <Package className="size-3.5 text-primary" />
              <span>Order Line Items</span>
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleAddItem}
              className="text-xs gap-1"
            >
              <Plus className="size-3.5" />
              <span>Add Item</span>
            </Button>
          </div>

          <div className="space-y-2 border border-border/80 rounded-xl p-2 bg-slate-50/50">
            {items.map((it, idx) => {
              const calc = lineCalculations[idx];
              const selectedProduct = products.find((p) => p.id === it.productId);
              return (
                <div
                  key={idx}
                  className="grid grid-cols-1 sm:grid-cols-12 gap-2 bg-white p-2.5 rounded-xl border border-border/80 shadow-2xs items-end"
                >
                  {/* Product */}
                  <div className="sm:col-span-4">
                    <Field label={`Item #${idx + 1} Product`}>
                      <Select
                        value={it.productId}
                        onChange={(e) => handleProductSelect(idx, e.target.value)}
                      >
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} (Stock: {p.stockQty}) — ₹{p.sellingPrice}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    {selectedProduct?.hasImei && (
                      <div className="mt-1">
                        <Input
                          value={it.assignedImei}
                          onChange={(e) => {
                            const newItems = [...items];
                            newItems[idx].assignedImei = e.target.value;
                            setItems(newItems);
                          }}
                          placeholder="Serial / IMEI (optional at booking)"
                          className="h-7 text-[11px] font-mono"
                        />
                      </div>
                    )}
                  </div>

                  {/* Quantity */}
                  <div className="sm:col-span-2">
                    <Field label="Qty">
                      <Input
                        type="number"
                        min="1"
                        value={it.quantity}
                        onChange={(e) => {
                          const newItems = [...items];
                          newItems[idx].quantity = Math.max(1, Number(e.target.value) || 1);
                          setItems(newItems);
                        }}
                      />
                    </Field>
                  </div>

                  {/* Unit Price */}
                  <div className="sm:col-span-2">
                    <Field label="Unit Price">
                      <Input
                        type="number"
                        value={it.unitPrice}
                        onChange={(e) => {
                          const newItems = [...items];
                          newItems[idx].unitPrice = Math.max(0, Number(e.target.value) || 0);
                          setItems(newItems);
                        }}
                      />
                    </Field>
                  </div>

                  {/* Discount */}
                  <div className="sm:col-span-2">
                    <Field label="Discount">
                      <Input
                        type="number"
                        value={it.discountAmount}
                        onChange={(e) => {
                          const newItems = [...items];
                          newItems[idx].discountAmount = Math.max(0, Number(e.target.value) || 0);
                          setItems(newItems);
                        }}
                      />
                    </Field>
                  </div>

                  {/* Subtotal & Delete */}
                  <div className="sm:col-span-2 flex items-center justify-between gap-1 pb-1">
                    <div className="text-right">
                      <div className="text-[10px] text-muted-foreground">Total (+GST)</div>
                      <div className="font-bold text-foreground text-xs num">
                        {inr(calc?.total || 0)}
                      </div>
                    </div>

                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(idx)}
                        className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                        title="Remove Item"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Advance Payment Details */}
        <Card className="p-4 bg-emerald-50/40 border-emerald-200/80">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-emerald-950 uppercase tracking-wide flex items-center gap-1.5">
              <IndianRupee className="size-3.5 text-emerald-600" />
              <span>Advance Token Payment (Optional)</span>
            </span>
            <span className="text-xs font-medium text-emerald-700">
              Immediate payment account deposit & receipt
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <Field label="Advance Amount">
              <Input
                type="number"
                min="0"
                max={totalAmount}
                value={advanceAmount}
                onChange={(e) =>
                  setAdvanceAmount(Math.min(totalAmount, Math.max(0, Number(e.target.value) || 0)))
                }
                placeholder="0"
                className="font-bold text-emerald-800"
              />
            </Field>

            <Field label="Payment Method">
              <Select
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value as any)}
                disabled={advanceAmount <= 0}
              >
                <option value="UPI">UPI / QR Code</option>
                <option value="CASH">Cash in Hand</option>
                <option value="CARD">Debit / Credit Card</option>
                <option value="BANK_TRANSFER">Direct Bank Transfer</option>
              </Select>
            </Field>

            <Field label="Deposit To Account">
              <Select
                value={paymentAccountId}
                onChange={(e) => setPaymentAccountId(e.target.value)}
                disabled={advanceAmount <= 0}
              >
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.accountName} ({acc.accountType}) — Bal: ₹{acc.currentBalance}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Reference / UTR #">
              <Input
                value={transactionReference}
                onChange={(e) => setTransactionReference(e.target.value)}
                placeholder="e.g. UPI Ref / Txn ID"
                disabled={advanceAmount <= 0}
              />
            </Field>
          </div>

          {/* Quick summary strip */}
          <div className="mt-4 pt-3 border-t border-emerald-200/80 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div>
              <span className="text-slate-600">Grand Total: </span>
              <span className="font-bold text-foreground text-sm num">{inr(totalAmount)}</span>
            </div>
            <div>
              <span className="text-emerald-700">Advance Paid: </span>
              <span className="font-bold text-emerald-700 text-sm num">{inr(advanceAmount)}</span>
            </div>
            <div>
              <span className="text-rose-700">Remaining Balance: </span>
              <span className="font-bold text-rose-700 text-sm num">{inr(balanceDue)}</span>
            </div>
          </div>
        </Card>

        {/* Notes */}
        <Field label="Internal Remarks / Customer Booking Instructions">
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Customer requested Blue Titanium color model, call when stock arrives"
          />
        </Field>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-border/80">
          <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => handleSave("DRAFT")}
            disabled={isSubmitting}
          >
            Save as Draft
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={() => handleSave("CONFIRMED")}
            disabled={isSubmitting}
            className="gap-1.5"
          >
            <CheckCircle2 className="size-4" />
            <span>Confirm Order & Save</span>
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ==========================================
// ORDER DETAILS MODAL
// ==========================================
function OrderDetailsModal({
  open,
  order,
  customer,
  accounts,
  onClose,
  onStatusChange,
  onOpenPayment,
  onOpenConvert,
  onOpenCancel,
  onOpenPrint,
  onOpenWhatsApp,
}: {
  open: boolean;
  order: CustomerOrder;
  customer?: Customer;
  accounts: PaymentAccount[];
  onClose: () => void;
  onStatusChange: (status: OrderStatus, notes?: string) => Promise<void>;
  onOpenPayment: () => void;
  onOpenConvert: () => void;
  onOpenCancel: () => void;
  onOpenPrint: () => void;
  onOpenWhatsApp: () => void;
}) {
  const isConverted = order.status === "CONVERTED_TO_SALE";
  const isCancelled = order.status === "CANCELLED";

  return (
    <Modal open={open} onClose={onClose} title={`Order Details — ${order.orderNumber}`} wide>
      <div className="space-y-5">
        {/* Top summary card */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-slate-50/80 rounded-xl border border-border/80">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-bold text-foreground">{order.orderNumber}</span>
              <Badge
                tone={
                  order.status === "READY"
                    ? "success"
                    : order.status === "DELIVERED"
                      ? "success"
                      : order.status === "CANCELLED"
                        ? "danger"
                        : order.status === "CONVERTED_TO_SALE"
                          ? "neutral"
                          : "info"
                }
              >
                {order.status}
              </Badge>
              {order.reservationActive && (
                <span className="text-[11px] font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200">
                  Stock Reserved
                </span>
              )}
            </div>
            <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3">
              <span>Date: {order.orderDate}</span>
              {order.expectedDeliveryDate && (
                <span>Expected Delivery: {order.expectedDeliveryDate}</span>
              )}
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onOpenPrint} className="gap-1">
              <Printer className="size-3.5" />
              <span>Print Slip</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onOpenWhatsApp}
              className="gap-1 text-emerald-700 hover:text-emerald-800"
            >
              <MessageSquare className="size-3.5" />
              <span>WhatsApp</span>
            </Button>
            {!isConverted && !isCancelled && order.balanceDue > 0 && (
              <Button variant="primary" size="sm" onClick={onOpenPayment} className="gap-1">
                <IndianRupee className="size-3.5" />
                <span>Receive Payment</span>
              </Button>
            )}
            {!isConverted && !isCancelled && (
              <Button variant="success" size="sm" onClick={onOpenConvert} className="gap-1">
                <span>Convert to Sale</span>
                <ArrowRight className="size-3.5" />
              </Button>
            )}
          </div>
        </div>

        {/* Customer & Status Control Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Customer info */}
          <Card className="p-3.5">
            <div className="text-xs font-bold text-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <User className="size-3.5 text-primary" />
              <span>Customer Details</span>
            </div>
            <div className="space-y-1 text-xs">
              <div className="font-bold text-foreground text-sm">
                {customer?.name || "Walk-in Customer"}
              </div>
              <div className="text-slate-600 font-mono">Mobile: {customer?.phone || "—"}</div>
              {customer?.address && (
                <div className="text-slate-600">Address: {customer.address}</div>
              )}
              {customer?.city && <div className="text-slate-600">City: {customer.city}</div>}
              {customer?.gstin && (
                <div className="text-slate-600 font-mono">GSTIN: {customer.gstin}</div>
              )}
            </div>
          </Card>

          {/* Status Workflow changer */}
          <Card className="p-3.5">
            <div className="text-xs font-bold text-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <SlidersHorizontal className="size-3.5 text-primary" />
              <span>Order Lifecycle Status</span>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Select
                  value={order.status}
                  disabled={isConverted || isCancelled}
                  onChange={(e) => onStatusChange(e.target.value as OrderStatus)}
                  className="text-xs"
                >
                  <option value="DRAFT">Draft</option>
                  <option value="CONFIRMED">Confirmed</option>
                  <option value="PARTIALLY_PAID">Partially Paid</option>
                  <option value="READY">Ready for Pickup / Delivery</option>
                  <option value="DELIVERED">Delivered to Customer</option>
                  <option value="CONVERTED_TO_SALE" disabled>
                    Converted to Sale
                  </option>
                  <option value="CANCELLED" disabled>
                    Cancelled
                  </option>
                </Select>
              </div>

              {!isConverted && !isCancelled && (
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] text-muted-foreground">
                    Change status to track order fulfillment progress
                  </span>
                  <button
                    onClick={onOpenCancel}
                    className="text-xs font-semibold text-rose-600 hover:text-rose-800 hover:underline cursor-pointer"
                  >
                    Cancel Order
                  </button>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Order Items Table */}
        <div>
          <div className="text-xs font-bold text-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <Package className="size-3.5 text-primary" />
            <span>Ordered Items & Serial/IMEI</span>
          </div>
          <div className="border border-border/80 rounded-xl overflow-hidden bg-white">
            <Table
              headers={[
                "Product Name",
                "Qty",
                ">Unit Price",
                ">Discount",
                ">GST",
                ">Total",
                "Assigned IMEI",
              ]}
            >
              {order.items.map((it) => (
                <Row key={it.id}>
                  <Td className="font-semibold text-foreground">{it.productName}</Td>
                  <Td mono>{it.quantity}</Td>
                  <Td right mono>
                    {inr(it.unitPrice)}
                  </Td>
                  <Td right mono>
                    {inr(it.discountAmount)}
                  </Td>
                  <Td right mono>
                    {it.taxRate}%
                  </Td>
                  <Td right mono className="font-bold">
                    {inr(it.totalAmount)}
                  </Td>
                  <Td>
                    {it.assignedImei ? (
                      <span className="font-mono text-xs text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                        {it.assignedImei}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs italic">Not assigned yet</span>
                    )}
                  </Td>
                </Row>
              ))}
            </Table>
          </div>
        </div>

        {/* Advance Payment History & Financial Breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          {/* Payment history */}
          <div className="md:col-span-7">
            <div className="text-xs font-bold text-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <Receipt className="size-3.5 text-emerald-600" />
              <span>Advance Payment Transactions</span>
            </div>
            <div className="border border-border/80 rounded-xl overflow-hidden bg-white">
              <Table headers={["Date", "Mode / Account", "Reference", ">Amount"]}>
                {order.payments && order.payments.length > 0 ? (
                  order.payments.map((p) => {
                    const acc = accounts.find((a) => a.id === p.paymentAccountId);
                    return (
                      <Row key={p.id}>
                        <Td className="text-xs font-mono">{p.paymentDate}</Td>
                        <Td>
                          <div className="font-semibold text-xs text-foreground">
                            {p.paymentMode}
                          </div>
                          {acc && (
                            <div className="text-[10px] text-muted-foreground">
                              {acc.accountName}
                            </div>
                          )}
                        </Td>
                        <Td className="text-xs font-mono text-slate-600">
                          {p.transactionReference || "—"}
                        </Td>
                        <Td right mono className="font-bold text-emerald-700 text-xs">
                          {inr(p.amount)}
                        </Td>
                      </Row>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-xs text-muted-foreground">
                      No advance payments logged yet.
                    </td>
                  </tr>
                )}
              </Table>
            </div>
          </div>

          {/* Financial summary card */}
          <div className="md:col-span-5">
            <div className="text-xs font-bold text-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <IndianRupee className="size-3.5 text-primary" />
              <span>Financial Summary</span>
            </div>
            <Card className="p-4 bg-slate-50/60 border-slate-200 space-y-2 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal (Net):</span>
                <span className="font-mono">{inr(order.subtotal)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Tax / GST:</span>
                <span className="font-mono">{inr(order.taxAmount)}</span>
              </div>
              {order.discountAmount > 0 && (
                <div className="flex justify-between text-emerald-600">
                  <span>Total Discount:</span>
                  <span className="font-mono">- {inr(order.discountAmount)}</span>
                </div>
              )}
              <div className="pt-2 border-t border-border/80 flex justify-between text-sm font-bold text-foreground">
                <span>Order Total:</span>
                <span className="num">{inr(order.totalAmount)}</span>
              </div>
              <div className="flex justify-between text-xs font-semibold text-emerald-700">
                <span>Total Advance Paid:</span>
                <span className="num">{inr(order.advancePaid)}</span>
              </div>
              <div className="pt-2 border-t border-border/80 flex justify-between text-sm font-bold text-rose-700">
                <span>Balance Due:</span>
                <span className="num">{inr(order.balanceDue)}</span>
              </div>
            </Card>
          </div>
        </div>

        {/* Timeline / Status History */}
        {order.statusHistory && order.statusHistory.length > 0 && (
          <div>
            <div className="text-xs font-bold text-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <Clock className="size-3.5 text-muted-foreground" />
              <span>Order Audit & Status Timeline</span>
            </div>
            <div className="border border-border/80 rounded-xl p-3 bg-slate-50/40 space-y-2">
              {order.statusHistory.map((h, i) => (
                <div key={i} className="flex items-start gap-2.5 text-xs">
                  <span className="size-2 rounded-full bg-slate-400 mt-1.5 shrink-0" />
                  <div className="flex-1">
                    <div className="font-semibold text-foreground">
                      Changed to <span className="text-primary">{h.status}</span>
                      {h.notes ? ` — "${h.notes}"` : ""}
                    </div>
                    <div className="text-[10.5px] text-muted-foreground font-mono">
                      {new Date(h.changedAt).toLocaleString("en-IN")} • by {h.changedBy || "Admin"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ==========================================
// RECEIVE PAYMENT MODAL
// ==========================================
function ReceivePaymentModal({
  open,
  order,
  customer,
  accounts,
  onClose,
  onSubmitPayment,
}: {
  open: boolean;
  order: CustomerOrder;
  customer?: Customer;
  accounts: PaymentAccount[];
  onClose: () => void;
  onSubmitPayment: (input: {
    orderId: string;
    amount: number;
    paymentMode: "CASH" | "UPI" | "BANK_TRANSFER" | "CARD";
    paymentAccountId?: string;
    transactionReference?: string;
    notes?: string;
  }) => Promise<void>;
}) {
  const [amount, setAmount] = useState<number>(order.balanceDue);
  const [paymentMode, setPaymentMode] = useState<"CASH" | "UPI" | "BANK_TRANSFER" | "CARD">("UPI");
  const [paymentAccountId, setPaymentAccountId] = useState<string>(accounts[0]?.id || "");
  const [transactionReference, setTransactionReference] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (amount <= 0) {
      alert("Please enter a valid payment amount greater than 0.");
      return;
    }
    if (amount > order.balanceDue) {
      alert(`Amount cannot exceed the remaining balance due of ₹${order.balanceDue}`);
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmitPayment({
        orderId: order.id,
        amount,
        paymentMode,
        paymentAccountId: paymentAccountId || undefined,
        transactionReference: transactionReference || undefined,
        notes: notes || undefined,
      });
    } catch (err: any) {
      alert(`Payment failed: ${err.message || err}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Receive Order Payment — ${order.orderNumber}`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-xs space-y-1">
          <div className="flex justify-between">
            <span className="text-emerald-800">Customer:</span>
            <span className="font-bold text-emerald-950">{customer?.name || "Walk-in"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-emerald-800">Total Order Amount:</span>
            <span className="font-mono">{inr(order.totalAmount)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-emerald-800">Already Paid in Advance:</span>
            <span className="font-mono text-emerald-700 font-semibold">
              {inr(order.advancePaid)}
            </span>
          </div>
          <div className="flex justify-between pt-1 border-t border-emerald-200 text-sm font-bold text-rose-700">
            <span>Outstanding Balance Due:</span>
            <span className="num">{inr(order.balanceDue)}</span>
          </div>
        </div>

        <Field label="Payment Amount to Collect (₹)">
          <Input
            type="number"
            min="1"
            max={order.balanceDue}
            value={amount}
            onChange={(e) =>
              setAmount(Math.min(order.balanceDue, Math.max(0, Number(e.target.value) || 0)))
            }
            className="text-base font-bold text-emerald-700"
            required
          />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Payment Method">
            <Select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value as any)}>
              <option value="UPI">UPI / QR Payment</option>
              <option value="CASH">Cash in Hand</option>
              <option value="CARD">Debit / Credit Card</option>
              <option value="BANK_TRANSFER">Bank Transfer / IMPS</option>
            </Select>
          </Field>

          <Field label="Deposit into Account">
            <Select value={paymentAccountId} onChange={(e) => setPaymentAccountId(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.accountName} ({a.accountType})
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Transaction Reference / UTR #">
          <Input
            value={transactionReference}
            onChange={(e) => setTransactionReference(e.target.value)}
            placeholder="e.g. UPI Ref / Bank UTR"
          />
        </Field>

        <Field label="Notes / Remarks">
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Part payment received via shop QR"
          />
        </Field>

        <div className="flex justify-end gap-2 pt-2 border-t border-border/80">
          <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" variant="success" disabled={isSubmitting} className="gap-1.5">
            <CheckCircle2 className="size-4" />
            <span>Record Payment & Update Ledger</span>
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ==========================================
// CONVERT ORDER TO SALE MODAL
// ==========================================
function ConvertOrderToSaleModal({
  open,
  order,
  customer,
  accounts,
  financeCompanies,
  onClose,
  onConvert,
}: {
  open: boolean;
  order: CustomerOrder;
  customer?: Customer;
  accounts: PaymentAccount[];
  financeCompanies: FinanceCompany[];
  onClose: () => void;
  onConvert: (input: {
    orderId: string;
    finalPaymentMode?: "Cash" | "UPI" | "Card" | "Bank" | "Credit" | "EMI";
    finalPaymentAccountId?: string;
    financeCompanyId?: string;
    emiTenure?: number;
    finalPaymentReference?: string;
  }) => Promise<void>;
}) {
  const hasRemainingBalance = order.balanceDue > 0;
  const [paymentType, setPaymentType] = useState<"DIRECT" | "EMI" | "CREDIT">(
    hasRemainingBalance ? "DIRECT" : "DIRECT",
  );
  const [finalPaymentMode, setFinalPaymentMode] = useState<"Cash" | "UPI" | "Card" | "Bank">(
    "Cash",
  );
  const [finalPaymentAccountId, setFinalPaymentAccountId] = useState<string>(accounts[0]?.id || "");
  const [financeCompanyId, setFinanceCompanyId] = useState<string>(financeCompanies[0]?.id || "");
  const [emiTenure, setEmiTenure] = useState<number>(6);
  const [reference, setReference] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      let finalMode: "Cash" | "UPI" | "Card" | "Bank" | "Credit" | "EMI" = finalPaymentMode;
      if (!hasRemainingBalance) {
        finalMode = "Cash";
      } else if (paymentType === "EMI") {
        finalMode = "EMI";
      } else if (paymentType === "CREDIT") {
        finalMode = "Credit";
      }

      await onConvert({
        orderId: order.id,
        finalPaymentMode: hasRemainingBalance ? finalMode : undefined,
        finalPaymentAccountId:
          hasRemainingBalance && paymentType === "DIRECT" ? finalPaymentAccountId : undefined,
        financeCompanyId:
          hasRemainingBalance && paymentType === "EMI" ? financeCompanyId : undefined,
        emiTenure: hasRemainingBalance && paymentType === "EMI" ? emiTenure : undefined,
        finalPaymentReference: reference || undefined,
      });
    } catch (err: any) {
      alert(`Conversion failed: ${err.message || err}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Convert Order ${order.orderNumber} to Official Sale`}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="p-3.5 bg-indigo-50/70 border border-indigo-200/80 rounded-xl text-xs space-y-1.5">
          <div className="flex items-center gap-1.5 font-bold text-indigo-950">
            <Sparkles className="size-4 text-indigo-600" />
            <span>Order to Commercial Sale Conversion</span>
          </div>
          <p className="text-slate-600">
            This will reduce physical warehouse inventory, assign permanent serials/IMEIs, credit
            advances to the sale receipt without double-counting account balances, and produce an
            official Tax Sale Invoice.
          </p>
        </div>

        {/* Order stats */}
        <div className="grid grid-cols-3 gap-2 p-3 bg-slate-50 rounded-xl border border-border/80 text-xs">
          <div>
            <span className="text-muted-foreground block">Order Total:</span>
            <span className="font-bold text-foreground text-sm num">{inr(order.totalAmount)}</span>
          </div>
          <div>
            <span className="text-emerald-700 block">Advance Collected:</span>
            <span className="font-bold text-emerald-700 text-sm num">{inr(order.advancePaid)}</span>
          </div>
          <div>
            <span className="text-rose-700 block">Balance Remaining:</span>
            <span className="font-bold text-rose-700 text-sm num">{inr(order.balanceDue)}</span>
          </div>
        </div>

        {/* Remaining balance handling */}
        {hasRemainingBalance ? (
          <div className="space-y-3 pt-1">
            <div className="text-xs font-bold text-foreground">
              How will the customer settle the remaining balance of {inr(order.balanceDue)}?
            </div>

            <div className="grid grid-cols-3 gap-2 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setPaymentType("DIRECT")}
                className={`p-2.5 rounded-xl border text-center transition-all ${
                  paymentType === "DIRECT"
                    ? "bg-primary text-white border-primary shadow-xs"
                    : "bg-white text-slate-700 border-border/80 hover:bg-slate-50"
                }`}
              >
                Cash / UPI / Card
              </button>
              <button
                type="button"
                onClick={() => setPaymentType("EMI")}
                className={`p-2.5 rounded-xl border text-center transition-all ${
                  paymentType === "EMI"
                    ? "bg-primary text-white border-primary shadow-xs"
                    : "bg-white text-slate-700 border-border/80 hover:bg-slate-50"
                }`}
              >
                EMI Finance
              </button>
              <button
                type="button"
                onClick={() => setPaymentType("CREDIT")}
                className={`p-2.5 rounded-xl border text-center transition-all ${
                  paymentType === "CREDIT"
                    ? "bg-primary text-white border-primary shadow-xs"
                    : "bg-white text-slate-700 border-border/80 hover:bg-slate-50"
                }`}
              >
                Customer Credit Due
              </button>
            </div>

            {paymentType === "DIRECT" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl border border-border/80">
                <Field label="Payment Method">
                  <Select
                    value={finalPaymentMode}
                    onChange={(e) => setFinalPaymentMode(e.target.value as any)}
                  >
                    <option value="Cash">Cash in Hand</option>
                    <option value="UPI">UPI / QR Code</option>
                    <option value="Card">Debit / Credit Card</option>
                    <option value="Bank">Direct Bank Transfer</option>
                  </Select>
                </Field>

                <Field label="Deposit Into Account">
                  <Select
                    value={finalPaymentAccountId}
                    onChange={(e) => setFinalPaymentAccountId(e.target.value)}
                  >
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.accountName} ({a.accountType})
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            )}

            {paymentType === "EMI" && (
              <div className="space-y-2.5 p-3 bg-slate-50 rounded-xl border border-border/80">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Finance Partner">
                    <Select
                      value={financeCompanyId}
                      onChange={(e) => setFinanceCompanyId(e.target.value)}
                    >
                      {financeCompanies.map((fc) => (
                        <option key={fc.id} value={fc.id}>
                          {fc.companyName}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Tenure (Months)">
                    <Select
                      value={emiTenure}
                      onChange={(e) => setEmiTenure(Number(e.target.value))}
                    >
                      <option value="3">3 Months</option>
                      <option value="6">6 Months</option>
                      <option value="9">9 Months</option>
                      <option value="12">12 Months</option>
                      <option value="18">18 Months</option>
                      <option value="24">24 Months</option>
                    </Select>
                  </Field>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  * Down Payment of {inr(order.advancePaid)} applied from order advances. Remaining
                  balance of {inr(order.balanceDue)} will be booked as an EMI finance receivable.
                </div>
              </div>
            )}

            {paymentType === "CREDIT" && (
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-800">
                Remaining balance of <strong>{inr(order.balanceDue)}</strong> will be booked as an
                outstanding customer ledger debit receivable.
              </div>
            )}

            <Field label="Reference / Notes">
              <Input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="e.g. Delivery voucher signed by customer"
              />
            </Field>
          </div>
        ) : (
          <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-xs text-emerald-800 font-semibold">
            ✓ Order is already fully paid through prior advance payments. No further balance
            collection is required!
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-border/80">
          <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={isSubmitting} className="gap-1.5">
            <CheckCircle2 className="size-4" />
            <span>Generate Sale Invoice & Deliver</span>
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ==========================================
// CANCEL ORDER MODAL
// ==========================================
function CancelOrderModal({
  open,
  order,
  customer,
  accounts,
  onClose,
  onCancel,
}: {
  open: boolean;
  order: CustomerOrder;
  customer?: Customer;
  accounts: PaymentAccount[];
  onClose: () => void;
  onCancel: (input: {
    orderId: string;
    reason: string;
    refundAmount?: number;
    refundPaymentAccountId?: string;
  }) => Promise<void>;
}) {
  const [reason, setReason] = useState("Customer requested cancellation");
  const [refundAmount, setRefundAmount] = useState<number>(order.advancePaid);
  const [refundAccountId, setRefundAccountId] = useState<string>(accounts[0]?.id || "");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      alert("Please provide a reason for order cancellation.");
      return;
    }

    setIsSubmitting(true);
    try {
      await onCancel({
        orderId: order.id,
        reason: reason.trim(),
        refundAmount: refundAmount > 0 ? refundAmount : undefined,
        refundPaymentAccountId: refundAmount > 0 ? refundAccountId : undefined,
      });
    } catch (err: any) {
      alert(`Cancellation failed: ${err.message || err}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Cancel Customer Order — ${order.orderNumber}`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 space-y-1">
          <div className="font-bold flex items-center gap-1.5">
            <AlertCircle className="size-4 text-rose-600" />
            <span>Are you sure you want to cancel this order?</span>
          </div>
          <p>
            Any inventory soft-reservations will be released immediately. If an advance payment was
            collected, you can issue an immediate refund from your cash or bank account.
          </p>
        </div>

        <Field label="Cancellation Reason *">
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Customer decided to purchase another model"
            required
          />
        </Field>

        {order.advancePaid > 0 && (
          <div className="space-y-3 p-3 bg-slate-50 rounded-xl border border-border/80">
            <div className="flex justify-between text-xs">
              <span className="font-semibold text-slate-700">Advance Paid by Customer:</span>
              <span className="font-bold text-emerald-700 num">{inr(order.advancePaid)}</span>
            </div>

            <Field label="Refund Amount to Customer (₹)">
              <Input
                type="number"
                min="0"
                max={order.advancePaid}
                value={refundAmount}
                onChange={(e) =>
                  setRefundAmount(
                    Math.min(order.advancePaid, Math.max(0, Number(e.target.value) || 0)),
                  )
                }
                className="font-bold"
              />
            </Field>

            {refundAmount > 0 && (
              <Field label="Refund From Payment Account">
                <Select
                  value={refundAccountId}
                  onChange={(e) => setRefundAccountId(e.target.value)}
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.accountName} ({a.accountType}) — Current Bal: ₹{a.currentBalance}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-border/80">
          <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>
            Keep Order
          </Button>
          <Button type="submit" variant="danger" disabled={isSubmitting} className="gap-1.5">
            <XCircle className="size-4" />
            <span>Confirm Order Cancellation</span>
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ==========================================
// ANALYTICS & ADVANCE REGISTER VIEW
// ==========================================
function AnalyticsAndRegisterView({
  orders,
  customers,
  accounts,
  onSelectOrder,
}: {
  orders: CustomerOrder[];
  customers: Customer[];
  accounts: PaymentAccount[];
  onSelectOrder: (order: CustomerOrder) => void;
}) {
  const customerMap = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers]);
  const accountMap = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);

  // Extract all advance payments flat
  const allPayments = useMemo(() => {
    const list: Array<{
      order: CustomerOrder;
      payment: CustomerOrder["payments"][number];
    }> = [];
    for (const o of orders) {
      if (o.payments) {
        for (const p of o.payments) {
          list.push({ order: o, payment: p });
        }
      }
    }
    return list.sort(
      (a, b) =>
        new Date(b.payment.paymentDate).getTime() - new Date(a.payment.paymentDate).getTime(),
    );
  }, [orders]);

  // Breakdown by status
  const statusCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const o of orders) {
      map[o.status] = (map[o.status] || 0) + 1;
    }
    return map;
  }, [orders]);

  return (
    <div className="space-y-6">
      {/* Advance Payments Register */}
      <Card>
        <CardHead
          title="Customer Order Advance Register"
          sub="Audit log of all token payments collected for customer pre-orders and advance bookings"
        />
        <Table
          headers={[
            "Date",
            "Order #",
            "Customer",
            "Mode",
            "Deposited Account",
            "Reference",
            ">Amount",
            ">Action",
          ]}
        >
          {allPayments.length === 0 ? (
            <tr>
              <td colSpan={8} className="py-10 text-center text-xs text-muted-foreground">
                No advance payments recorded yet.
              </td>
            </tr>
          ) : (
            allPayments.map(({ order, payment }, idx) => {
              const cust = customerMap.get(order.customerId);
              const acc = payment.paymentAccountId
                ? accountMap.get(payment.paymentAccountId)
                : undefined;

              return (
                <Row key={payment.id || idx}>
                  <Td mono className="text-xs">
                    {payment.paymentDate}
                  </Td>
                  <Td className="font-bold text-foreground">{order.orderNumber}</Td>
                  <Td>
                    <div className="font-semibold text-xs text-foreground">
                      {cust?.name || "Walk-in"}
                    </div>
                    <div className="text-[10.5px] text-muted-foreground font-mono">
                      {cust?.phone || "—"}
                    </div>
                  </Td>
                  <Td>
                    <Badge tone="info">{payment.paymentMode}</Badge>
                  </Td>
                  <Td className="text-xs text-slate-700 font-medium">
                    {acc?.accountName || "Default Cash"}
                  </Td>
                  <Td mono className="text-xs text-slate-600">
                    {payment.transactionReference || "—"}
                  </Td>
                  <Td right mono className="font-bold text-emerald-700 text-xs">
                    {inr(payment.amount)}
                  </Td>
                  <Td right>
                    <button
                      onClick={() => onSelectOrder(order)}
                      className="text-xs font-semibold text-primary hover:underline"
                    >
                      View Order
                    </button>
                  </Td>
                </Row>
              );
            })
          )}
        </Table>
      </Card>

      {/* Order Status Breakdown */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {Object.entries(statusCounts).map(([st, cnt]) => (
          <div
            key={st}
            className="p-3.5 rounded-xl border border-border/80 bg-white/90 shadow-2xs text-center"
          >
            <div className="text-[11px] font-semibold text-muted-foreground uppercase">{st}</div>
            <div className="text-xl font-bold text-foreground mt-1 num">{cnt}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
