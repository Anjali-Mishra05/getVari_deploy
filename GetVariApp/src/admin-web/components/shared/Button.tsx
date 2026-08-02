import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  children,
  className = '',
  ...props
}) => {
  const baseStyles = 'inline-flex items-center justify-center rounded-xl font-mono text-[11px] font-bold tracking-wider transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:pointer-events-none';

  const variants = {
    primary: 'bg-cyan-500 text-neutral-950 hover:bg-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.2)]',
    secondary: 'bg-white/10 text-white hover:bg-white/20 border border-white/10',
    outline: 'bg-transparent text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/10',
    ghost: 'bg-transparent text-neutral-400 hover:text-white hover:bg-white/5',
    danger: 'bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500 hover:text-white',
  };

  const sizes = {
    sm: 'px-3 py-1.5',
    md: 'px-5 py-2.5',
    lg: 'px-8 py-3.5',
  };

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};

export default Button;
