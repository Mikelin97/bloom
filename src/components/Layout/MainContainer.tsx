import React from 'react';

export default function MainContainer({
  children,
  className
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <main className={`mx-auto w-full max-w-3xl px-6 pt-10 pb-24 transition-[padding,margin] duration-300 md:px-10 md:pb-10 ${className ?? ''}`}>
      {children}
    </main>
  );
}
