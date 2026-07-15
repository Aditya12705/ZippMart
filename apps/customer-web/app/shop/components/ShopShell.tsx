"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useShop, apiBase, type RecommendationProduct } from "../context/ShopContext";

const TITLES: Record<string, string> = {
  "/shop/scan": "Scan",
  "/shop/search": "Browse",
  "/shop/cart": "Your bag",
  "/shop/checkout": "Checkout"
};

function backHref(pathname: string): string {
  if (pathname === "/shop/checkout") return "/shop/cart";
  return "/shop";
}

export function ShopShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/shop";
  const { cartItemCount } = useShop();
  const isHome = pathname === "/shop";
  const title = TITLES[pathname];
  const [helpOpen, setHelpOpen] = useState(false);
  const helpCloseRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!helpOpen) return;
    helpCloseRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setHelpOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [helpOpen]);

  // Chatbot State
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<Array<{ sender: "user" | "assistant"; text: string; image?: string }>>([
    { sender: "assistant", text: "Hi! I'm your ProFlo AI Fashion Assistant. Ask me for styling advice, trend updates, or outfit matches. You can also upload a photo of yourself to ask what will suit you!" }
  ]);
  const [chatInput, setChatInput] = useState("");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [chatLoading, setChatLoading] = useState(false);
  const [productCache, setProductCache] = useState<Record<string, RecommendationProduct>>({});
  
  const { addToCart } = useShop();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    if (chatOpen) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatOpen, chatMessages, chatLoading]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("Please upload an image file.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setSelectedImage(String(reader.result));
    };
    reader.readAsDataURL(file);
  };

  const handleSendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = chatInput.trim();
    if (!text && !selectedImage) return;

    const userMsg = { sender: "user" as const, text, image: selectedImage || undefined };
    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput("");
    setSelectedImage(null);
    setChatLoading(true);

    try {
      const history = chatMessages.map((m) => ({
        role: m.sender === "user" ? "user" : "assistant",
        content: m.text,
        image: m.image
      }));
      history.push({
        role: "user",
        content: text,
        image: userMsg.image
      });

      const resp = await fetch(`${apiBase}/v1/customer/fashion-bot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history })
      });

      if (!resp.ok) throw new Error("API error");
      const data = await resp.json();
      
      const assistantMsg = { sender: "assistant" as const, text: data.content };
      setChatMessages((prev) => [...prev, assistantMsg]);

      // Parse barcodes and fetch product info
      const barcodes = [];
      const regex = /\[Product:(\d+)\]/g;
      let match;
      while ((match = regex.exec(data.content)) !== null) {
        barcodes.push(match[1]);
      }

      if (barcodes.length > 0) {
        for (const barcode of barcodes) {
          if (!productCache[barcode]) {
            try {
              const pResp = await fetch(`${apiBase}/v1/customer/products?q=${barcode}`);
              if (pResp.ok) {
                const pList = await pResp.json();
                if (pList && pList.length > 0) {
                  setProductCache((prev) => ({ ...prev, [barcode]: pList[0] }));
                }
              }
            } catch (e) {
              console.error("Error fetching product for bot:", e);
            }
          }
        }
      }
    } catch {
      setChatMessages((prev) => [
        ...prev,
        { sender: "assistant", text: "Sorry, I am having trouble connecting to the styling service right now. Please try again later!" }
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const getMessageProducts = (text: string): RecommendationProduct[] => {
    const barcodes: string[] = [];
    const regex = /\[Product:(\d+)\]/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
      barcodes.push(match[1]);
    }
    return barcodes
      .map((b) => productCache[b])
      .filter(Boolean);
  };

  return (
    <div className="shopApp">
      <header className="siteHeader">
        <div className="siteHeader__inner">
          {isHome ? (
            <>
              <Link href="/shop" className="siteHeader__brand" aria-label="ProFlo home">
                <span className="brandZipp">Pro</span>
                <span className="brandMart">Flo</span>
              </Link>
              <nav className="siteHeader__nav" aria-label="Shop sections">
                <Link href="/shop/scan" className="siteHeader__pill">
                  Scan
                </Link>
                <Link href="/shop/search" className="siteHeader__pill">
                  Browse
                </Link>
              </nav>
            </>
          ) : (
            <>
              <Link href={backHref(pathname)} className="siteHeader__back" aria-label="Back">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M15 18l-6-6 6-6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </Link>
              <h1 className="siteHeader__pageTitle">{title ?? "Shop"}</h1>
            </>
          )}
          <Link href="/shop/cart" className="siteHeader__bag" aria-label={`Shopping bag, ${cartItemCount} items`}>
            <span className="siteHeader__bagIcon" aria-hidden>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path
                  d="M6 6h15l-1.5 9h-12L6 6zm0 0L5 3H2"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx="9" cy="20" r="1" fill="currentColor" />
                <circle cx="18" cy="20" r="1" fill="currentColor" />
              </svg>
            </span>
            {cartItemCount > 0 ? <span className="siteHeader__bagCount">{cartItemCount > 99 ? "99+" : cartItemCount}</span> : null}
          </Link>
        </div>
      </header>

      <main className="shopShell" id="shop-main">
        {children}
      </main>

      <footer className="siteFooter">
        <div className="siteFooter__inner">
          <div className="siteFooter__links">
            <button type="button" className="siteFooter__linkBtn" onClick={() => setHelpOpen(true)}>
              Help
            </button>
            <span className="siteFooter__dot" aria-hidden>
              ·
            </span>
            <span className="siteFooter__muted">Store: self-checkout</span>
            <span className="siteFooter__dot" aria-hidden>
              ·
            </span>
            <span className="siteFooter__muted">Bag syncs while this visit is active</span>
          </div>
          <p className="siteFooter__legal">© {new Date().getFullYear()} ProFlo · Fashion at the speed of scan</p>
        </div>
      </footer>

      {helpOpen ? (
        <div
          className="helpBackdrop"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setHelpOpen(false);
          }}
        >
          <div className="helpPanel" role="dialog" aria-modal="true" aria-labelledby="shop-help-title">
            <h2 id="shop-help-title" className="helpPanel__title">
              Quick help
            </h2>
            <ul className="helpPanel__list">
              <li>
                <strong>Scan</strong> uses your camera — allow access when prompted, or type the barcode digits
                manually.
              </li>
              <li>
                <strong>Browse</strong> suggests products as you type; pick one to see details and add to your bag.
              </li>
              <li>
                For <strong>pay at counter</strong>, show the cashier your queue number and order ID (copy buttons on
                the confirmation screen).
              </li>
              <li>
                Totals include tax per line. If something looks wrong, ask a staff member before paying.
              </li>
            </ul>
            <button ref={helpCloseRef} type="button" className="helpPanel__close" onClick={() => setHelpOpen(false)}>
              Close
            </button>
          </div>
        </div>
      ) : null}
      {/* Floating Fashion Bot */}
      <div className="fashionBotContainer">
        {chatOpen ? (
          <div className="fashionBotPanel" role="dialog" aria-label="AI Fashion Assistant">
            <header className="fashionBotHeader">
              <div className="fashionBotHeader__info">
                <span className="fashionBotHeader__avatar">🤖</span>
                <div>
                  <h3 className="fashionBotHeader__title">ProFlo Stylist</h3>
                  <span className="fashionBotHeader__status">Online · AI Assistant</span>
                </div>
              </div>
              <button 
                type="button" 
                className="fashionBotHeader__close" 
                onClick={() => setChatOpen(false)}
                aria-label="Close Chat"
              >
                ✕
              </button>
            </header>

            <div className="fashionBotMessages">
              {chatMessages.map((msg, idx) => {
                const messageProducts = msg.sender === "assistant" ? getMessageProducts(msg.text) : [];
                return (
                  <div key={idx} className={`chatBubble chatBubble--${msg.sender}`}>
                    <div className="chatBubble__content">
                      {msg.image ? (
                        <div className="chatBubble__uploadedImage">
                          <img src={msg.image} alt="User upload" />
                        </div>
                      ) : null}
                      <p className="chatBubble__text">
                        {msg.sender === "assistant" ? msg.text.replace(/\[Product:\d+\]/g, "").trim() : msg.text}
                      </p>
                      
                      {messageProducts.length > 0 ? (
                        <div className="chatBubble__products">
                          {messageProducts.map((p) => (
                            <div key={p.id} className="chatProductCard">
                              {p.imageUrl ? (
                                <img src={p.imageUrl} alt="" className="chatProductCard__thumb" />
                              ) : (
                                <span className="chatProductCard__thumb chatProductCard__thumb--empty" />
                              )}
                              <div className="chatProductCard__details">
                                <h4 className="chatProductCard__name">{p.name}</h4>
                                <span className="chatProductCard__price">${p.unitPrice.toFixed(2)}</span>
                                <button
                                  type="button"
                                  className="chatProductCard__btn"
                                  onClick={async () => {
                                    if (p.barcode) {
                                      const success = await addToCart(p.barcode, 1);
                                      if (success) {
                                        alert(`${p.name} added to bag!`);
                                      }
                                    }
                                  }}
                                >
                                  Add to Bag
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
              {chatLoading ? (
                <div className="chatBubble chatBubble--assistant">
                  <div className="chatBubble__content">
                    <div className="typingIndicator">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                  </div>
                </div>
              ) : null}
              <div ref={chatEndRef} />
            </div>

            <form onSubmit={(e) => void handleSendChatMessage(e)} className="fashionBotInputArea">
              {selectedImage ? (
                <div className="fashionBotInputArea__preview">
                  <img src={selectedImage} alt="Preview" />
                  <button type="button" className="fashionBotInputArea__previewRemove" onClick={() => setSelectedImage(null)}>
                    ✕
                  </button>
                </div>
              ) : null}
              <div className="fashionBotInputRow">
                <input
                  type="file"
                  ref={fileInputRef}
                  style={{ display: "none" }}
                  accept="image/*"
                  onChange={handleImageUpload}
                />
                <button
                  type="button"
                  className="fashionBotInputRow__attach"
                  onClick={() => fileInputRef.current?.click()}
                  aria-label="Upload photo"
                >
                  📷
                </button>
                <input
                  type="text"
                  placeholder="Ask for style tips, outfit matches..."
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  className="fashionBotInputRow__input"
                />
                <button type="submit" className="fashionBotInputRow__send" aria-label="Send">
                  Send
                </button>
              </div>
            </form>
          </div>
        ) : null}

        <button
          type="button"
          className="fashionBotToggleBtn"
          onClick={() => setChatOpen((prev) => !prev)}
          aria-label="Toggle AI Stylist"
        >
          {chatOpen ? "✕" : "✨ Stylist"}
        </button>
      </div>
    </div>
  );
}
