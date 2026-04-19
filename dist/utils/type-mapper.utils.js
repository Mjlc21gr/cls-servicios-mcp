/**
 * Mapeo de tipos entre React y Angular/TypeScript.
 * Convierte tipos de props, estado y retornos de API.
 */
const REACT_TO_TS_TYPE_MAP = {
    'React.ReactNode': 'TemplateRef<unknown> | null',
    'React.ReactElement': 'TemplateRef<unknown>',
    'React.CSSProperties': 'Record<string, string>',
    'React.ChangeEvent<HTMLInputElement>': 'Event',
    'React.FormEvent<HTMLFormElement>': 'Event',
    'React.MouseEvent': 'MouseEvent',
    'React.KeyboardEvent': 'KeyboardEvent',
    'JSX.Element': 'TemplateRef<unknown>',
    'React.FC': 'void',
    'React.Dispatch<React.SetStateAction<string>>': 'WritableSignal<string>',
    'React.Dispatch<React.SetStateAction<number>>': 'WritableSignal<number>',
    'React.Dispatch<React.SetStateAction<boolean>>': 'WritableSignal<boolean>',
    'React.MutableRefObject': 'ElementRef',
};
export function mapReactTypeToAngular(reactType) {
    if (REACT_TO_TS_TYPE_MAP[reactType]) {
        return REACT_TO_TS_TYPE_MAP[reactType];
    }
    // Dispatch<SetStateAction<T>> → WritableSignal<T>
    const setStateMatch = reactType.match(/React\.Dispatch<React\.SetStateAction<(.+)>>/);
    if (setStateMatch) {
        return `WritableSignal<${setStateMatch[1]}>`;
    }
    // React.RefObject<T> → ElementRef<T>
    const refMatch = reactType.match(/React\.(?:Mutable)?RefObject<(.+)>/);
    if (refMatch) {
        return `ElementRef<${refMatch[1]}>`;
    }
    // Array genéricos
    if (reactType.endsWith('[]')) {
        const inner = reactType.slice(0, -2);
        return `${mapReactTypeToAngular(inner)}[]`;
    }
    // Promise<T> se mantiene
    const promiseMatch = reactType.match(/Promise<(.+)>/);
    if (promiseMatch) {
        return `Observable<${promiseMatch[1]}>`;
    }
    return reactType;
}
export function inferTypeFromValue(value) {
    if (value === 'true' || value === 'false')
        return 'boolean';
    if (value === 'null')
        return 'unknown';
    if (value === 'undefined')
        return 'unknown';
    if (/^['"`]/.test(value))
        return 'string';
    if (/^\d+$/.test(value))
        return 'number';
    if (/^\d+\.\d+$/.test(value))
        return 'number';
    if (value.startsWith('['))
        return 'unknown[]';
    if (value.startsWith('{'))
        return 'Record<string, unknown>';
    return 'unknown';
}
export function mapHttpMethodFromFetchCall(fetchBody) {
    const methodMatch = fetchBody.match(/method:\s*['"](\w+)['"]/i);
    if (methodMatch) {
        const method = methodMatch[1].toUpperCase();
        if (['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
            return method;
        }
    }
    if (fetchBody.includes('.post(') || fetchBody.includes('.post '))
        return 'POST';
    if (fetchBody.includes('.put(') || fetchBody.includes('.put '))
        return 'PUT';
    if (fetchBody.includes('.delete(') || fetchBody.includes('.delete '))
        return 'DELETE';
    if (fetchBody.includes('.patch(') || fetchBody.includes('.patch '))
        return 'PATCH';
    return 'GET';
}
//# sourceMappingURL=type-mapper.utils.js.map