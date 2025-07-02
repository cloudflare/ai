'use client';

import React, { useState } from 'react';
import { SmartInput, SmartTextarea } from '@/components/ai/ai-suggestions';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Sparkles } from 'lucide-react';
import { toast } from 'sonner';

export default function SmartFormsPage() {
  const [restaurantForm, setRestaurantForm] = useState({
    name: '',
    description: '',
    cuisine: '',
    specialties: '',
    marketingMessage: '',
    promotionalEmail: ''
  });

  const [menuForm, setMenuForm] = useState({
    itemName: '',
    description: '',
    ingredients: '',
    price: '',
    category: ''
  });

  const handleSubmit = (formType: 'restaurant' | 'menu') => {
    toast.success(`${formType} form submitted with AI assistance!`);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <Sparkles className="w-8 h-8 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">Smart Forms with AI Suggestions</h1>
              <p className="text-sm text-muted-foreground">
                Forms enhanced with AI-powered suggestions
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Restaurant Information Form */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" />
                Restaurant Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="restaurant-name">Restaurant Name</Label>
                <SmartInput
                  id="restaurant-name"
                  fieldName="Restaurant Name"
                  context="Restaurant naming for a new establishment"
                  value={restaurantForm.name}
                  onChange={(e) => setRestaurantForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Enter restaurant name..."
                  className="w-full px-3 py-2 border rounded-md"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="restaurant-cuisine">Cuisine Type</Label>
                <SmartInput
                  id="restaurant-cuisine"
                  fieldName="Cuisine Type"
                  context="Type of cuisine for a restaurant"
                  value={restaurantForm.cuisine}
                  onChange={(e) => setRestaurantForm(prev => ({ ...prev, cuisine: e.target.value }))}
                  placeholder="e.g., Italian, Asian Fusion, American..."
                  className="w-full px-3 py-2 border rounded-md"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="restaurant-description">Description</Label>
                <SmartTextarea
                  id="restaurant-description"
                  fieldName="Restaurant Description"
                  context="Professional description for a restaurant website or menu"
                  value={restaurantForm.description}
                  onChange={(e) => setRestaurantForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Describe your restaurant..."
                  className="w-full px-3 py-2 border rounded-md min-h-[100px]"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="restaurant-specialties">Specialties</Label>
                <SmartTextarea
                  id="restaurant-specialties"
                  fieldName="Restaurant Specialties"
                  context={`Signature dishes and specialties for a ${restaurantForm.cuisine || 'modern'} restaurant`}
                  value={restaurantForm.specialties}
                  onChange={(e) => setRestaurantForm(prev => ({ ...prev, specialties: e.target.value }))}
                  placeholder="List your signature dishes..."
                  className="w-full px-3 py-2 border rounded-md min-h-[80px]"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="marketing-message">Marketing Message</Label>
                <SmartTextarea
                  id="marketing-message"
                  fieldName="Marketing Message"
                  context={`Marketing copy for ${restaurantForm.name || 'a restaurant'} specializing in ${restaurantForm.cuisine || 'fine dining'}`}
                  value={restaurantForm.marketingMessage}
                  onChange={(e) => setRestaurantForm(prev => ({ ...prev, marketingMessage: e.target.value }))}
                  placeholder="Create compelling marketing copy..."
                  className="w-full px-3 py-2 border rounded-md min-h-[100px]"
                />
              </div>

              <Button 
                onClick={() => handleSubmit('restaurant')} 
                className="w-full"
              >
                Submit Restaurant Information
              </Button>
            </CardContent>
          </Card>

          {/* Menu Item Form */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" />
                Menu Item Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="item-name">Item Name</Label>
                <SmartInput
                  id="item-name"
                  fieldName="Menu Item Name"
                  context={`Creative menu item names for a ${restaurantForm.cuisine || 'modern'} restaurant`}
                  value={menuForm.itemName}
                  onChange={(e) => setMenuForm(prev => ({ ...prev, itemName: e.target.value }))}
                  placeholder="Enter menu item name..."
                  className="w-full px-3 py-2 border rounded-md"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="item-category">Category</Label>
                <SmartInput
                  id="item-category"
                  fieldName="Menu Category"
                  context="Menu categories for restaurant organization (appetizers, mains, desserts, etc.)"
                  value={menuForm.category}
                  onChange={(e) => setMenuForm(prev => ({ ...prev, category: e.target.value }))}
                  placeholder="e.g., Appetizers, Main Course..."
                  className="w-full px-3 py-2 border rounded-md"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="item-ingredients">Ingredients</Label>
                <SmartTextarea
                  id="item-ingredients"
                  fieldName="Ingredients"
                  context={`Ingredients for ${menuForm.itemName || 'a menu item'} in ${restaurantForm.cuisine || 'modern'} cuisine`}
                  value={menuForm.ingredients}
                  onChange={(e) => setMenuForm(prev => ({ ...prev, ingredients: e.target.value }))}
                  placeholder="List main ingredients..."
                  className="w-full px-3 py-2 border rounded-md min-h-[80px]"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="item-description">Description</Label>
                <SmartTextarea
                  id="item-description"
                  fieldName="Menu Item Description"
                  context={`Appetizing menu description for ${menuForm.itemName || 'a dish'} with ingredients: ${menuForm.ingredients}`}
                  value={menuForm.description}
                  onChange={(e) => setMenuForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Write an appetizing description..."
                  className="w-full px-3 py-2 border rounded-md min-h-[100px]"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="item-price">Price</Label>
                <SmartInput
                  id="item-price"
                  fieldName="Menu Item Price"
                  context={`Pricing for ${menuForm.itemName || 'menu items'} in a ${restaurantForm.cuisine || 'modern'} restaurant`}
                  value={menuForm.price}
                  onChange={(e) => setMenuForm(prev => ({ ...prev, price: e.target.value }))}
                  placeholder="$0.00"
                  className="w-full px-3 py-2 border rounded-md"
                />
              </div>

              <Button 
                onClick={() => handleSubmit('menu')} 
                className="w-full"
              >
                Add Menu Item
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Usage Instructions */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>How to Use AI Suggestions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div className="flex items-start gap-3">
                <Sparkles className="w-5 h-5 text-primary mt-0.5" />
                <div>
                  <h4 className="font-medium mb-1">Click the Sparkles Icon</h4>
                  <p className="text-muted-foreground">
                    Look for the sparkles icon next to input fields to get AI-powered suggestions.
                  </p>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <Sparkles className="w-5 h-5 text-primary mt-0.5" />
                <div>
                  <h4 className="font-medium mb-1">Context-Aware Suggestions</h4>
                  <p className="text-muted-foreground">
                    Suggestions are tailored based on other form fields and the specific context.
                  </p>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <Sparkles className="w-5 h-5 text-primary mt-0.5" />
                <div>
                  <h4 className="font-medium mb-1">One-Click Application</h4>
                  <p className="text-muted-foreground">
                    Click any suggestion to instantly apply it to the field.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}