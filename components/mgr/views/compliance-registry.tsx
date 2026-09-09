// components/mgr/views/compliance-registry.tsx — brand and license lists.
// Live slots Tabs and ApprovalForm / RegistrationForm / LicenseForm.
"use client";

import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ComplianceRegistryViewModel } from "@/lib/mgr/compliance-registry-view";

export type { ComplianceRegistryViewModel };

export function ComplianceRegistryView({
  model,
  actions = {},
  addBrands,
  addLicenses,
}: {
  model: ComplianceRegistryViewModel;
  actions?: Record<string, ReactNode>;
  addBrands?: ReactNode;
  addLicenses?: ReactNode;
}) {
  return (
    <>
      {E.back("Compliance months", "Registry", undefined, model.backHref)}
      <Tabs defaultValue="brands" className="min-w-0">
        <TabsList variant="solid" className="w-full"><TabsTrigger value="brands">brands</TabsTrigger><TabsTrigger value="licenses">licenses</TabsTrigger></TabsList>
        <TabsContent value="brands">
            {model.brands.map((brand) => (
              <Fragment key={brand.key}>
                {E.row(brand.title, brand.detail, "", brand.warning ? "w" : "")}
                {brand.rows.map((row) => (
                  <Fragment key={row.key}>
                    {E.row(row.title, row.detail, row.key in actions ? actions[row.key] : (row.verb ? E.act(row.verb) : ""))}
                  </Fragment>
                ))}
              </Fragment>
            ))}
            {model.brands.length === 0 && E.blank("No brands yet")}
            {addBrands !== undefined ? addBrands : E.btns(["Add approval", "Add registration"])}
        </TabsContent>
        <TabsContent value="licenses">
            {model.licenses.map((row) => (
              <Fragment key={row.key}>
                {E.row(row.title, row.detail, row.key in actions ? actions[row.key] : (row.verb ? E.act(row.verb) : ""))}
              </Fragment>
            ))}
            {addLicenses !== undefined ? addLicenses : E.btn("Add license", "g")}
        </TabsContent>
      </Tabs>
      {E.note(model.note)}
    </>
  );
}
