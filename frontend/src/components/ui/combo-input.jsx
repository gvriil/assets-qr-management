import { useState, useRef, useEffect, useCallback, memo } from 'react';
import { Input } from './input';
import { Label } from './label';

// Memoized ComboInput to prevent re-renders losing focus
const ComboInput = memo(function ComboInput({ 
  label, 
  value, 
  options = [], 
  onChange, 
  placeholder,
  className = ''
}) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [localValue, setLocalValue] = useState(value || '');
  const inputRef = useRef(null);
  const isInternalChange = useRef(false);
  
  // Sync with external value only when it changes externally
  useEffect(() => {
    if (!isInternalChange.current) {
      setLocalValue(value || '');
    }
    isInternalChange.current = false;
  }, [value]);
  
  // Filter options - match anywhere in string (case insensitive)
  const filteredOptions = options.filter(opt => 
    opt && localValue && opt.toLowerCase().includes(localValue.toLowerCase())
  );
  
  const handleInputChange = useCallback((e) => {
    const newValue = e.target.value;
    isInternalChange.current = true;
    setLocalValue(newValue);
    onChange(newValue);
  }, [onChange]);
  
  const handleSelect = useCallback((opt) => {
    isInternalChange.current = true;
    setLocalValue(opt);
    onChange(opt);
    setShowDropdown(false);
    // Keep focus on input after selection
    setTimeout(() => inputRef.current?.focus(), 10);
  }, [onChange]);
  
  const handleFocus = useCallback(() => {
    setShowDropdown(true);
  }, []);
  
  const handleBlur = useCallback(() => {
    // Delay to allow click on dropdown item
    setTimeout(() => setShowDropdown(false), 200);
  }, []);
  
  return (
    <div className={`space-y-2 relative ${className}`}>
      {label && <Label className="text-zinc-300">{label}</Label>}
      <Input
        ref={inputRef}
        value={localValue}
        onChange={handleInputChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
        className="bg-zinc-900 border-zinc-700 text-white"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck="false"
      />
      {showDropdown && filteredOptions.length > 0 && localValue.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-md shadow-lg max-h-40 overflow-y-auto">
          {filteredOptions.slice(0, 15).map((opt, i) => (
            <div
              key={i}
              className="px-3 py-2 hover:bg-zinc-700 cursor-pointer text-sm text-white"
              onMouseDown={(e) => {
                e.preventDefault(); // Prevent blur
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
});

export { ComboInput };
export default ComboInput;
