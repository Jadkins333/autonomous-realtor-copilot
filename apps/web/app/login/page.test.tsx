 
import React from 'react' 
 
import { fireEvent, render, screen, waitFor } from '@testing-library/react' 
import { beforeEach, describe, expect, it, vi } from 'vitest' 
 
import LoginPage from './page' 
import { signIn } from 'next-auth/react' 
import { useRouter } from 'next/navigation' 
 
vi.mock('@/components/ui/button', function () { 
 return { 
  Button: function Button(props: React.ButtonHTMLAttributes<HTMLButtonElement>) { 
   return React.createElement('button', props, props.children)  
  } 
 } 
}) 
 
vi.mock('@/components/ui/card', function () { 
 return { 
  Card: function Card(props: React.HTMLAttributes<HTMLDivElement>) { 
   return React.createElement('div', props, props.children)  
  }, 
  CardTitle: function CardTitle(props: React.HTMLAttributes<HTMLHeadingElement>) { 
   return React.createElement('h2', props, props.children)  
  }, 
  CardDescription: function CardDescription(props: React.HTMLAttributes<HTMLParagraphElement>) { 
   return React.createElement('p', props, props.children)  
  } 
 } 
}) 
 
vi.mock('@/components/ui/input', function () { 
 return { 
  Input: function Input(props: React.InputHTMLAttributes<HTMLInputElement>) { 
   return React.createElement('input', props)  
  } 
 } 
}) 
 
vi.mock('next-auth/react', function () { 
 return { signIn: vi.fn() } 
}) 
 
vi.mock('next/navigation', function () { 
 return { useRouter: vi.fn() } 
}) 
 
describe('LoginPage', function () { 
 beforeEach(function () { 
  vi.clearAllMocks() 
  vi.mocked(useRouter).mockReturnValue({ push: vi.fn() } as never) 
  vi.mocked(signIn).mockResolvedValue({ ok: true, error: null, status: 200, url: null }) 
 }) 
 
 it('submits tenant slug with email and password', async function () { 
  render(React.createElement(LoginPage)) 
  fireEvent.change(screen.getByPlaceholderText('Tenant slug'), { target: { value: 'demo-realty' } }) 
  fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'agent@example.com' } }) 
  fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'secret' } }) 
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' })) 
 
  await waitFor(function () { 
   expect(signIn).toHaveBeenCalledWith('credentials', { 
    tenant_slug: 'demo-realty', 
    email: 'agent@example.com', 
    password: 'secret', 
    redirect: false 
   }) 
  }) 
 }) 
}) 
