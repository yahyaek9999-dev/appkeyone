'use client';

import { useState, useMemo } from 'react';
import { Search, Filter, ChevronDown, ChevronRight, Badge } from 'lucide-react';

interface Feature {
  id: string;
  key: string;
  nameEn: string;
  nameAr: string;
  type: 'feature' | 'subfeature' | 'admin_internal';
  category: string;
  parentFeature?: string;
  capability: string;
  requiredPlan: 'start' | 'growth' | 'pro' | 'enterprise';
  routes: string[];
  apiFamilies: string[];
  status: 'implemented' | 'beta' | 'coming_soon' | 'disabled' | 'deprecated';
  implemented: boolean;
  customerVisible: boolean;
  adminVisible: boolean;
  discoverable: boolean;
  notes?: string;
}

export default function AdminFeatureCenter() {
  const [features, setFeatures] = useState<Feature[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedFeatures, setExpandedFeatures] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState({
    category: '',
    plan: '',
    type: '',
    status: '',
    discoverable: 'all',
  });

  const categories = [
    'home', 'conversations', 'customers', 'sales', 'marketing',
    'automation', 'analytics', 'settings', 'admin'
  ];

  const plans = ['start', 'growth', 'pro', 'enterprise'];
  const types = ['feature', 'subfeature', 'admin_internal'];
  const statuses = ['implemented', 'beta', 'coming_soon', 'disabled', 'deprecated'];

  const filteredFeatures = useMemo(() => {
    return features.filter(f => {
      // Search filter
      const matchesSearch =
        f.nameEn.toLowerCase().includes(searchQuery.toLowerCase()) ||
        f.nameAr.includes(searchQuery) ||
        f.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
        f.id.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      // Category filter
      if (filters.category && f.category !== filters.category) return false;

      // Plan filter
      if (filters.plan && f.requiredPlan !== filters.plan) return false;

      // Type filter
      if (filters.type && f.type !== filters.type) return false;

      // Status filter
      if (filters.status && f.status !== filters.status) return false;

      // Discoverability filter
      if (filters.discoverable === 'hidden' && f.discoverable) return false;
      if (filters.discoverable === 'discoverable' && !f.discoverable) return false;

      return true;
    });
  }, [features, searchQuery, filters]);

  const coreFeatures = filteredFeatures.filter(f => f.type === 'feature');
  const subfeatures = filteredFeatures.filter(f => f.type === 'subfeature');
  const adminFeatures = filteredFeatures.filter(f => f.type === 'admin_internal');

  const stats = {
    total: features.length,
    implemented: features.filter(f => f.implemented).length,
    discoverable: features.filter(f => f.discoverable).length,
    hidden: features.filter(f => !f.discoverable && f.type !== 'admin_internal').length,
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
      case 'implemented': return 'bg-green-100 text-green-800';
      case 'beta': return 'bg-blue-100 text-blue-800';
      case 'coming_soon': return 'bg-yellow-100 text-yellow-800';
      case 'disabled': return 'bg-red-100 text-red-800';
      case 'deprecated': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getPlanBadgeColor = (plan: string) => {
    switch (plan) {
      case 'start': return 'bg-slate-100 text-slate-800';
      case 'growth': return 'bg-blue-100 text-blue-800';
      case 'pro': return 'bg-purple-100 text-purple-800';
      case 'enterprise': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const FeatureRow = ({ feature, isSubfeature = false }: { feature: Feature; isSubfeature?: boolean }) => {
    const childFeatures = features.filter(f => f.parentFeature === feature.id);
    const isExpanded = expandedFeatures.has(feature.id);

    return (
      <div key={feature.id} className={isSubfeature ? 'ml-4' : ''}>
        <div className="border-b hover:bg-slate-50 dark:hover:bg-slate-900 px-4 py-3 flex items-center gap-3">
          {childFeatures.length > 0 && (
            <button
              onClick={() => toggleExpanded(feature.id)}
              className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded"
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </button>
          )}
          {childFeatures.length === 0 && <div className="w-6" />}

          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-gray-500">{feature.id}</span>
              <span className="font-medium">{feature.nameEn}</span>
              <span className="text-sm text-gray-600">{feature.nameAr}</span>
            </div>
            {feature.notes && (
              <p className="text-xs text-gray-600 mt-1">{feature.notes}</p>
            )}
            {feature.routes.length > 0 && (
              <p className="text-xs text-gray-500 mt-1">Route: {feature.routes.join(', ')}</p>
            )}
          </div>

          <div className="flex gap-2">
            <Badge className={getPlanBadgeColor(feature.requiredPlan)}>
              {feature.requiredPlan}
            </Badge>
            <Badge className={getStatusColor(feature.status)}>
              {feature.status}
            </Badge>
            {!feature.discoverable && feature.type !== 'admin_internal' && (
              <Badge className="bg-orange-100 text-orange-800">Hidden</Badge>
            )}
            {feature.type === 'admin_internal' && (
              <Badge className="bg-red-100 text-red-800">Admin Only</Badge>
            )}
          </div>
        </div>

        {isExpanded && childFeatures.map(child => (
          <FeatureRow key={child.id} feature={child} isSubfeature={true} />
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6 p-6">
      {/* Stats */}
      <div className="grid grid-cols-5 gap-4">
        <div className="bg-slate-100 dark:bg-slate-900 p-4 rounded">
          <div className="text-sm text-gray-600">Total Features</div>
          <div className="text-2xl font-bold">{stats.total}</div>
        </div>
        <div className="bg-green-100 dark:bg-green-900 p-4 rounded">
          <div className="text-sm text-green-800">Implemented</div>
          <div className="text-2xl font-bold">{stats.implemented}</div>
        </div>
        <div className="bg-blue-100 dark:bg-blue-900 p-4 rounded">
          <div className="text-sm text-blue-800">Discoverable</div>
          <div className="text-2xl font-bold">{stats.discoverable}</div>
        </div>
        <div className="bg-orange-100 dark:bg-orange-900 p-4 rounded">
          <div className="text-sm text-orange-800">Hidden</div>
          <div className="text-2xl font-bold">{stats.hidden}</div>
        </div>
        <div className="bg-red-100 dark:bg-red-900 p-4 rounded">
          <div className="text-sm text-red-800">Admin Only</div>
          <div className="text-2xl font-bold">{stats.admin}</div>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="space-y-4">
        <div className="flex gap-2">
          <Search className="w-5 h-5 text-gray-400 self-center" />
          <input
            type="text"
            placeholder="Search by name, ID, or capability..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="flex-1 px-3 py-2 border rounded-lg dark:bg-slate-900 dark:border-slate-700"
          />
        </div>

        <div className="flex gap-2 flex-wrap">
          <select
            value={filters.category}
            onChange={e => setFilters({ ...filters, category: e.target.value })}
            className="px-3 py-2 border rounded-lg dark:bg-slate-900 dark:border-slate-700"
          >
            <option value="">All Categories</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>

          <select
            value={filters.plan}
            onChange={e => setFilters({ ...filters, plan: e.target.value })}
            className="px-3 py-2 border rounded-lg dark:bg-slate-900 dark:border-slate-700"
          >
            <option value="">All Plans</option>
            {plans.map(plan => (
              <option key={plan} value={plan}>{plan}</option>
            ))}
          </select>

          <select
            value={filters.type}
            onChange={e => setFilters({ ...filters, type: e.target.value })}
            className="px-3 py-2 border rounded-lg dark:bg-slate-900 dark:border-slate-700"
          >
            <option value="">All Types</option>
            {types.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>

          <select
            value={filters.discoverable}
            onChange={e => setFilters({ ...filters, discoverable: e.target.value })}
            className="px-3 py-2 border rounded-lg dark:bg-slate-900 dark:border-slate-700"
          >
            <option value="all">All Discoverability</option>
            <option value="discoverable">Discoverable Only</option>
            <option value="hidden">Hidden Only</option>
          </select>
        </div>
      </div>

      {/* Core Features */}
      {coreFeatures.length > 0 && (
        <div className="border rounded-lg">
          <div className="bg-slate-100 dark:bg-slate-900 px-4 py-3 font-semibold">
            Core Features ({coreFeatures.length})
          </div>
          <div>
            {coreFeatures.map(f => (
              <FeatureRow key={f.id} feature={f} />
            ))}
          </div>
        </div>
      )}

      {/* Subfeatures */}
      {subfeatures.length > 0 && (
        <div className="border rounded-lg">
          <div className="bg-slate-100 dark:bg-slate-900 px-4 py-3 font-semibold">
            Sub-Features ({subfeatures.length})
          </div>
          <div>
            {subfeatures.map(f => (
              <FeatureRow key={f.id} feature={f} isSubfeature={true} />
            ))}
          </div>
        </div>
      )}

      {/* Admin/Internal Features */}
      {adminFeatures.length > 0 && (
        <div className="border rounded-lg">
          <div className="bg-red-100 dark:bg-red-900 px-4 py-3 font-semibold">
            Admin/Internal Features ({adminFeatures.length})
          </div>
          <div>
            {adminFeatures.map(f => (
              <FeatureRow key={f.id} feature={f} />
            ))}
          </div>
        </div>
      )}

      {filteredFeatures.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          No features match your filters
        </div>
      )}
    </div>
  );
}
