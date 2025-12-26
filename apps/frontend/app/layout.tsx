"use client";
import { useState, useEffect } from "react";
import "./globals.css";

// Navigation items with icons
const navItems = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
      </svg>
    ),
  },
  {
    href: "/receipts",
    label: "Invoices",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    href: "/upload",
    label: "Upload",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
      </svg>
    ),
  },
];

const SIDEBAR_EXPANDED = 280;
const SIDEBAR_COLLAPSED = 72;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isHovering, setIsHovering] = useState(false);

  useEffect(() => {
    setMounted(true);
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Sidebar expands on hover
  const isExpanded = isHovering && !isMobile;

  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=Inter:wght@500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased" style={{ fontFamily: '"DM Sans", system-ui, sans-serif' }}>
        <div className="flex relative">
          {/* Mobile overlay */}
          {isMobile && isHovering && (
            <div
              className="fixed inset-0 bg-black/50 z-30 backdrop-blur-sm"
              onClick={() => setIsHovering(false)}
              style={{
                animation: 'fadeIn 200ms ease-out',
              }}
            />
          )}

          {/* Desktop hover overlay - subtle darkening when sidebar expands on hover */}
          {!isMobile && isHovering && (
            <div
              className="fixed inset-0 bg-black/10 z-30 pointer-events-none"
              style={{
                animation: 'fadeIn 150ms ease-out',
              }}
            />
          )}

          {/* Sidebar */}
          <aside
            className="fixed left-0 top-0 h-screen z-40 flex flex-col"
            style={{
              width: SIDEBAR_EXPANDED,
              transform: isMobile 
                ? (isHovering ? 'translateX(0)' : `translateX(-${SIDEBAR_EXPANDED}px)`)
                : (isExpanded ? 'translateX(0)' : `translateX(-${SIDEBAR_EXPANDED - SIDEBAR_COLLAPSED}px)`),
              transition: 'transform 250ms cubic-bezier(0.4, 0, 0.2, 1)',
              willChange: 'transform',
            }}
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
          >
            {/* Sidebar background - Ocean to Violet gradient */}
            <div 
              className="absolute inset-0"
              style={{ 
                background: "linear-gradient(160deg, #1d4ed8 0%, #4338ca 40%, #6d28d9 70%, #7c3aed 100%)",
              }}
            >
              {/* Subtle texture overlay */}
              <div
                className="absolute inset-0 opacity-[0.06]"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
                }}
              />
              {/* Light accent glow - top right */}
              <div
                className="absolute -top-20 -right-20 w-72 h-72 rounded-full"
                style={{
                  background: "radial-gradient(circle, rgba(255, 255, 255, 0.15) 0%, transparent 70%)",
                  filter: "blur(40px)",
                }}
              />
              {/* Purple accent glow - bottom left */}
              <div
                className="absolute -bottom-20 -left-20 w-56 h-56 rounded-full"
                style={{
                  background: "radial-gradient(circle, rgba(109, 40, 217, 0.3) 0%, transparent 70%)",
                  filter: "blur(30px)",
                }}
              />
              {/* Shimmer overlay */}
              <div
                className="absolute inset-0"
                style={{
                  background: "linear-gradient(180deg, rgba(255,255,255,0.08) 0%, transparent 30%, transparent 70%, rgba(0,0,0,0.1) 100%)",
                }}
              />
            </div>

            {/* Sidebar content */}
            <div className="relative z-10 flex flex-col h-full">
              {/* Header */}
              <div className="flex items-center h-16 px-4">
                {/* Brand text - on the left, fades out */}
                <div
                  className="flex-1 overflow-hidden"
                  style={{
                    opacity: isExpanded ? 1 : 0,
                    transform: isExpanded ? 'translateX(0)' : 'translateX(-10px)',
                    transition: 'opacity 200ms ease-out, transform 200ms ease-out',
                    transitionDelay: isExpanded ? '100ms' : '0ms',
                  }}
                >
                  <h1 
                    className="text-lg font-semibold text-white tracking-tight whitespace-nowrap"
                    style={{ fontFamily: '"Inter", system-ui, sans-serif' }}
                  >
                    Invoice AI
                  </h1>
                  <p className="text-xs font-medium text-white/60 whitespace-nowrap">
                    Agent Console
                  </p>
                </div>
                
                {/* Logo mark - on the right, always visible */}
                <div 
                  className="flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center bg-white/20 backdrop-blur-sm border border-white/20"
                  style={{ boxShadow: "0 4px 20px rgba(0, 0, 0, 0.15)" }}
                >
                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14l-5-5 1.41-1.41L12 14.17l4.59-4.59L18 11l-6 6z" />
                  </svg>
                </div>
              </div>

              {/* Navigation */}
              <nav className="flex-1 mt-4 px-2">
                <ul className="space-y-1">
                  {navItems.map((item, index) => (
                    <li key={item.href}>
                      <a
                        href={item.href}
                        className="group flex items-center gap-3 px-2 py-2.5 rounded-xl text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                      >
                        {/* Label - on the left, fades out */}
                        <span
                          className="flex-1 font-medium whitespace-nowrap overflow-hidden"
                          style={{
                            opacity: isExpanded ? 1 : 0,
                            transform: isExpanded ? 'translateX(0)' : 'translateX(-10px)',
                            transition: 'opacity 200ms ease-out, transform 200ms ease-out',
                            transitionDelay: isExpanded ? `${120 + index * 30}ms` : '0ms',
                          }}
                        >
                          {item.label}
                        </span>
                        
                        {/* Icon - on the right, always visible */}
                        <span className="flex-shrink-0 w-11 h-10 rounded-lg flex items-center justify-center bg-white/10 group-hover:bg-white/20 transition-colors">
                          {item.icon}
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            </div>

            {/* Right edge shadow for depth */}
            <div
              className="absolute right-0 top-0 w-4 h-full z-20 pointer-events-none"
              style={{
                background: 'linear-gradient(to right, transparent, rgba(0,0,0,0.1))',
                opacity: isExpanded ? 1 : 0,
                transition: 'opacity 300ms ease-out',
              }}
            />
          </aside>

          {/* Mobile toggle button */}
          {isMobile && !isHovering && (
            <button
              onClick={() => setIsHovering(true)}
              className="fixed top-4 left-4 z-50 w-12 h-12 rounded-xl flex items-center justify-center shadow-xl text-white"
              style={{
                background: "linear-gradient(135deg, #1d4ed8 0%, #6d28d9 100%)",
              }}
              aria-label="Open menu"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          )}

          {/* Main content area - FIXED margin, no animation */}
          <div
            className="flex flex-col min-h-screen w-full"
            style={{
              marginLeft: isMobile ? 0 : SIDEBAR_COLLAPSED,
            }}
          >
            <main className={`flex-1 p-6 md:p-8 lg:p-10 ${mounted ? 'animate-fade-slide-up' : 'opacity-0'}`}>
              {children}
            </main>
          </div>
        </div>

        <style jsx global>{`
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
        `}</style>
      </body>
    </html>
  );
}