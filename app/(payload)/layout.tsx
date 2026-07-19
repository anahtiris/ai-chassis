import type { ServerFunctionClient } from 'payload'
import config from '@payload-config'
import '@payloadcms/next/css'
// Same admin/Payload Tailwind theme app/admin/layout.tsx imports — shared,
// not duplicated (Next dedupes by resolved file path), so custom
// Tailwind-based components rendered inside /admin/cms (BackToHubButton,
// future custom fields) get the same brand tokens as the rest of the admin
// portal. See docs/decisions.md "Separate Tailwind themes per section."
import '@/app/globals.css'
import { handleServerFunctions, RootLayout } from '@payloadcms/next/layouts'
import React from 'react'
import { importMap } from './admin/cms/importMap'

type Args = {
  children: React.ReactNode
}

const serverFunction: ServerFunctionClient = async function (args) {
  'use server'
  return handleServerFunctions({
    ...args,
    config,
    importMap,
  })
}

const Layout = ({ children }: Args) => (
  <RootLayout config={config} importMap={importMap} serverFunction={serverFunction}>
    {children}
  </RootLayout>
)

export default Layout
