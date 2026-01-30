import React from 'react';

export default function MainContainer({
  children,
  panelOpen
}: {
  children: React.ReactNode;
  panelOpen?: boolean;
}) {
  return (
    <main
      className={`mx-auto w-full max-w-3xl px-6 pt-10 pb-24 transition-[padding] duration-300 md:px-10 md:pb-10 ${
        panelOpen ? 'lg:pr-[360px] xl:pr-[420px]' : ''
      }`}
    >
      {children}
    </main>
  );
}
