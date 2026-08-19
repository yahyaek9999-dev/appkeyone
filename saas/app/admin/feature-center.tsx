'use client';

import { useState, useMemo, useEffect } from 'react';
import { Search, Filter, ChevronDown, ChevronRight, Badge, ToggleLeft, ToggleRight } from 'lucide-react';
import masterInventory from '../../../project-knowledge/master-product-inventory.json';

interface Feature {
  featureId: string;
  name: string;
  category: string;
  workspace: string;
  tier: string;
  type: 'feature' | 'subfeature' | 'admin_internal';
  status: 'enabled' | 'beta' | 'disabled' | 'deprecated';
  customerVisible: boolean;
  adminVisible: boolean;
  adminOnly: boolean;
  description: string;
  completeness: number;
  routes: string[];
  evidence: string;
}

export default function AdminFeatureCenter() {
  const [features, setFeatures] = useState<Feature[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedFeatures, setExpandedFeatures] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState({
    category: '',
    type: '',
    status: '',
    visibility: 'all',
  });

  // Load features from master inventory on mount
  useEffect(() => {
    if (masterInventory && masterInventory.features) {
      setFeatures(masterInventory.features as Feature[]);
    }
  }, []);

  const categories = masterInventory.categories || [
    'messaging', 'commerce', 'support', 'ai', 'analytics',
    'automation', 'operations', 'settings', 'team', 'enterprise'
  ];

  const types = ['feature', 'subfeature', 'admin_internal'];
  const statuses = ['enabled', 'beta', 'disabled', 'deprecated'];

  const filteredFeatures = useMemo(() => {
    return features.filter(f => {
      // Search filter
      const matchesSearch =
        f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        f.featureId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        f.description.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      // Category filter
      if (filters.category && f.category !== filters.category) return false;

      // Type filter
      if (filters.type && f.type !== filters.type) return false;

      // Status filter
      if (filters.status && f.status !== filters.status) return false;

      // Visibility filter
      if (filters.visibility === 'customer-only' && !f.customerVisible) return false;
      if (filters.visibility === 'admin-only' && f.customerVisible) return false;
      if (filters.visibility === 'hidden' && f.customerVisible) return false;

      return true;
    });
  }, [features, searchQuery, filters]);

  const coreFeatures = filteredFeatures.filter(f => f.type === 'feature');
  const subfeatures = filteredFeatures.filter(f => f.type === 'subfeature');
  const adminFeatures = filteredFeatures.filter(f => f.type === 'admin_internal');

  const stats = {
    total: features.length,
    adminVisible: features.filter(f => f.adminVisible).length,
    customerVisible: features.filter(f => f.customerVisible).length,
    hidden: features.filter(f => !f.customerVisible && f.type !== 'admin_internal').length,
    admin: features.filter(f => f.type === 'admin_internal').length,
  };

  const toggleExpanded = (id: string) => {
    const newExpanded = new Set(expandedFeatures);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedFeatures(newExpanded);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'enabled': return 'bg-green-100 text-green-800';
      case 'beta': return 'bg-yellow-100 text-yellow-800';
      case 'disabled': return 'bg-gray-100 text-gray-800';
      case 'deprecated': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'k_start': return 'bg-blue-100 text-blue-800';
      case 'k_growth': return 'bg-purple-100 text-purple-800';
      case 'k_pro': return 'bg-indigo-100 text-indigo-800';
      case 'k_enterprise': return 'bg-pink-100 text-pink-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Feature Control Center</h1>
          <p className="text-gray-600">Manage all {stats.total} KEYONE features, control visibility, and manage rollouts</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-5 gap-4 mb-8">
          <div className="bg-white rounded-lg p-4 shadow">
            <div className="text-3xl font-bold text-gray-900">{stats.total}</div>
            <div className="text-sm text-gray-600">Total Features</div>
          </div>
          <div className="bg-white rounded-lg p-4 shadow">
            <div className="text-3xl font-bold text-blue-600">{stats.customerVisible}</div>
            <div className="text-sm text-gray-600">Customer-Visible</div>
          </div>
          <div className="bg-white rounded-lg p-4 shadow">
            <div className="text-3xl font-bold text-purple-600">{stats.adminVisible}</div>
            <div className="text-sm text-gray-600">Admin-Visible</div>
          </div>
          <div className="bg-white rounded-lg p-4 shadow">
            <div className="text-3xl font-bold text-gray-600">{stats.hidden}</div>
            <div className="text-sm text-gray-600">Hidden Features</div>
          </div>
          <div className="bg-white rounded-lg p-4 shadow">
            <div className="text-3xl font-bold text-gray-900">{stats.admin}</div>
            <div className="text-sm text-gray-600">Admin-Only</div>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <div className="flex gap-4 mb-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 text-gray-400" size={20} />
              <input
                type="text"
                placeholder="Search features by name, ID, or description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <div className="flex gap-4 flex-wrap">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Category</label>
              <select
                value={filters.category}
                onChange={(e) => setFilters({...filters, category: e.target.value})}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="">All Categories</option>
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Type</label>
              <select
                value={filters.type}
                onChange={(e) => setFilters({...filters, type: e.target.value})}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="">All Types</option>
                {types.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Status</label>
              <select
                value={filters.status}
                onChange={(e) => setFilters({...filters, status: e.target.value})}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="">All Statuses</option>
                {statuses.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Visibility</label>
              <select
                value={filters.visibility}
                onChange={(e) => setFilters({...filters, visibility: e.target.value})}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="all">All</option>
                <option value="customer-only">Customer-Visible</option>
                <option value="admin-only">Admin-Only</option>
                <option value="hidden">Hidden</option>
              </select>
            </div>
          </div>
        </div>

        {/* Features List */}
        <div className="space-y-4">
          {/* Core Features */}
          {coreFeatures.length > 0 && (
            <div>
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Core Features ({coreFeatures.length})</h2>
              <div className="space-y-2">
                {coreFeatures.map(feature => (
                  <div key={feature.featureId} className="bg-white rounded-lg shadow">
                    <div
                      className="p-4 cursor-pointer hover:bg-gray-50 flex items-center justify-between"
                      onClick={() => toggleExpanded(feature.featureId)}
                    >
                      <div className="flex items-center gap-4 flex-1">
                        {expandedFeatures.has(feature.featureId) ? (
                          <ChevronDown size={20} className="text-gray-400" />
                        ) : (
                          <ChevronRight size={20} className="text-gray-400" />
                        )}
                        <div className="flex-1">
                          <div className="font-semibold text-gray-900">{feature.name}</div>
                          <div className="text-sm text-gray-600">{feature.featureId}</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Badge className={getTierColor(feature.tier)}>{feature.tier}</Badge>
                        <Badge className={getStatusColor(feature.status)}>{feature.status}</Badge>
                        {feature.customerVisible && (
                          <Badge className="bg-green-100 text-green-800">Customer</Badge>
                        )}
                        {feature.adminVisible && (
                          <Badge className="bg-blue-100 text-blue-800">Admin</Badge>
                        )}
                      </div>
                    </div>

                    {expandedFeatures.has(feature.featureId) && (
                      <div className="px-4 pb-4 border-t border-gray-200">
                        <div className="mt-4 space-y-4">
                          <div>
                            <label className="text-sm font-medium text-gray-700">Description</label>
                            <p className="text-gray-600 text-sm mt-1">{feature.description}</p>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="text-sm font-medium text-gray-700">Category</label>
                              <p className="text-gray-600 text-sm mt-1">{feature.category}</p>
                            </div>
                            <div>
                              <label className="text-sm font-medium text-gray-700">Workspace</label>
                              <p className="text-gray-600 text-sm mt-1">{feature.workspace}</p>
                            </div>
                            <div>
                              <label className="text-sm font-medium text-gray-700">Completeness</label>
                              <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                                <div
                                  className="bg-blue-600 h-2 rounded-full"
                                  style={{width: `${feature.completeness}%`}}
                                />
                              </div>
                              <p className="text-gray-600 text-xs mt-1">{feature.completeness}%</p>
                            </div>
                          </div>

                          <div>
                            <label className="text-sm font-medium text-gray-700">Routes</label>
                            <div className="space-y-1 mt-1">
                              {feature.routes.map(route => (
                                <code key={route} className="text-xs bg-gray-100 px-2 py-1 rounded block text-gray-600">
                                  {route}
                                </code>
                              ))}
                            </div>
                          </div>

                          <div>
                            <label className="text-sm font-medium text-gray-700">Evidence</label>
                            <p className="text-gray-600 text-sm mt-1 bg-gray-50 p-2 rounded">{feature.evidence}</p>
                          </div>

                          <div className="flex gap-4">
                            <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                              <ToggleRight size={20} />
                              Toggle Visibility
                            </button>
                            <button className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50">
                              Edit Metadata
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Subfeatures */}
          {subfeatures.length > 0 && (
            <div>
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Subfeatures ({subfeatures.length})</h2>
              <div className="space-y-2">
                {subfeatures.map(feature => (
                  <div key={feature.featureId} className="bg-white rounded-lg shadow">
                    <div className="p-4 flex items-center justify-between">
                      <div>
                        <div className="font-medium text-gray-900">{feature.name}</div>
                        <div className="text-xs text-gray-500">ID: {feature.featureId}</div>
                      </div>
                      <div className="flex gap-2">
                        <Badge className={getTierColor(feature.tier)}>{feature.tier}</Badge>
                        <Badge className={getStatusColor(feature.status)}>{feature.status}</Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Admin Features */}
          {adminFeatures.length > 0 && (
            <div>
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Admin-Only Features ({adminFeatures.length})</h2>
              <div className="space-y-2">
                {adminFeatures.map(feature => (
                  <div key={feature.featureId} className="bg-white rounded-lg shadow">
                    <div className="p-4 flex items-center justify-between">
                      <div>
                        <div className="font-medium text-gray-900">{feature.name}</div>
                        <div className="text-xs text-gray-500">ID: {feature.featureId}</div>
                      </div>
                      <div className="flex gap-2">
                        <Badge className="bg-red-100 text-red-800">Admin-Only</Badge>
                        <Badge className={getStatusColor(feature.status)}>{feature.status}</Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {filteredFeatures.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-600">No features match your search and filter criteria.</p>
          </div>
        )}
      </div>
    </div>
  );
}
