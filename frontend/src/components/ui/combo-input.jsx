import { useState, useRef, useEffect, useMemo } from 'react';
import { Input } from './input';
import { Label } from './label';

/**
 * ComboInput - input with autocomplete dropdown
 * Fixed for mobile: uses uncontrolled input internally to prevent focus loss
 */
function ComboInput({ 
  label, 
  value, 
  options = [], 
  onChange, 
  placeholder,
  className = ''
}) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [inputValue, setInputValue] = useState(value || '');
  const inputRef = useRef(null);
  const containerRef = useRef(null);
  const skipNextSync = useRef(false);
  
  // Sync external value -> internal, but skip if we just made internal change
  useEffect(() => {
    if (skipNextSync.current) {
      skipNextSync.current = false;
      return;
    }
    setInputValue(value || '');
  }, [value]);
  
  // Filter options - match anywhere in string (case insensitive)
  const filteredOptions = useMemo(() => {
    if (!inputValue || inputValue.length < 1) return [];
    const search = inputValue.toLowerCase();
    return options.filter(opt => 
      opt && opt.toLowerCase().includes(search)
    ).slice(0, 15);
  }, [options, inputValue]);
  
  // Handle typing - update local state immediately, debounce parent update
  const handleInputChange = (e) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    skipNextSync.current = true;
    // Notify parent
    onChange(newValue);
  };
  
  // Handle dropdown item selection
  const handleSelect = (opt) => {
    setInputValue(opt);
    skipNextSync.current = true;
    onChange(opt);
    setShowDropdown(false);
  };
  
  // Show dropdown on focus
  const handleFocus = () => {
    setShowDropdown(true);
  };
  
  // Hide dropdown on blur (with delay for click handling)
  const handleBlur = (e) => {
    // Check if blur target is inside container (dropdown click)
    const relatedTarget = e.relatedTarget;
    if (containerRef.current?.contains(relatedTarget)) {
      return; // Don't close if clicking dropdown
    }
    setTimeout(() => setShowDropdown(false), 150);
  };
  
  return (
    <div ref={containerRef} className={`space-y-2 relative ${className}`}>
      {label && <Label className="text-zinc-300">{label}</Label>}
      <Input
        ref={inputRef}
        type="text"
        inputMode="text"
        value={inputValue}
        onChange={handleInputChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
        className="bg-zinc-900 border-zinc-700 text-white"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        data-lpignore="true"
        data-form-type="other"
      />
      {showDropdown && filteredOptions.length > 0 && (
        <div 
          className="absolute z-50 w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-md shadow-lg max-h-40 overflow-y-auto"
          tabIndex={-1}
        >
          {filteredOptions.map((opt, i) => (
            <div
              key={`${opt}-${i}`}
              className="px-3 py-2 hover:bg-zinc-700 cursor-pointer text-sm text-white active:bg-zinc-600"
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={() => handleSelect(opt)}
              onTouchEnd={(e) => {
                e.preventDefault();
                handleSelect(opt);
              }}
            >
              {opt}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export { ComboInput };
export default ComboInput;
